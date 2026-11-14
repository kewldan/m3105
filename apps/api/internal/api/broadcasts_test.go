package api_test

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"
)

// TestBroadcasts checks the bot's mailing journal: a canceled session writes
// a broadcast with a delivery per signed-up student. The test bot token is
// fake, so Telegram refuses (401) and the delivery is failed with a reason;
// a student without Telegram is skipped. Retry resends only the failed ones.
func TestBroadcasts(t *testing.T) {
	ctx := context.Background()
	admin := newClient(t).bearer(testAPIToken)
	subj := admin.do("POST", "/api/v1/admin/subjects", map[string]any{"name": "Предмет рассылок", "color": "blue"}, 201)
	subjectID := int64(subj["id"].(float64))
	t.Cleanup(func() { admin.do("DELETE", fmt.Sprintf("/api/v1/admin/subjects/%d", subjectID), nil, 200) })
	lab := admin.do("POST", "/api/v1/admin/labs", map[string]any{"subjectId": subjectID, "number": 1, "title": "Лаба рассылок", "status": "draft"}, 201)
	labID := int64(lab["id"].(float64))
	sess := admin.do("POST", "/api/v1/admin/practice", map[string]any{"subjectId": subjectID,
		"startsAt": time.Now().Add(72 * time.Hour).UTC().Format(time.RFC3339), "location": "ауд. 101"}, 201)
	sessID := int64(sess["id"].(float64))

	var withTG, withoutTG int64
	if err := testPool.QueryRow(ctx, `INSERT INTO users (webauthn_id, name, telegram_id) VALUES ('bc-tg', 'Рассылкин С Телеграмом', 990011) RETURNING id`).Scan(&withTG); err != nil {
		t.Fatal(err)
	}
	if err := testPool.QueryRow(ctx, `INSERT INTO users (webauthn_id, name) VALUES ('bc-none', 'Рассылкин Без Телеграма') RETURNING id`).Scan(&withoutTG); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = testPool.Exec(ctx, `DELETE FROM users WHERE id IN ($1, $2)`, withTG, withoutTG) })
	for _, u := range []int64{withTG, withoutTG} {
		if _, err := testPool.Exec(ctx, `INSERT INTO practice_signups (session_id, user_id, lab_id) VALUES ($1, $2, $3)`, sessID, u, labID); err != nil {
			t.Fatal(err)
		}
	}

	admin.do("POST", fmt.Sprintf("/api/v1/admin/practice/%d/cancel", sessID), map[string]any{"reason": "Болезнь"}, 200)

	// Рассылка уходит в фоне: ждём, пока все доставки получат итог.
	var bc map[string]any
	deadline := time.Now().Add(40 * time.Second)
	for {
		for _, b := range admin.list("/api/v1/admin/broadcasts?kind=practice_canceled", 200) {
			if b["refId"] == float64(sessID) {
				bc = b
			}
		}
		if bc != nil && bc["total"] == float64(2) && bc["pending"] == float64(0) {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("broadcast not finished: %v", bc)
		}
		time.Sleep(200 * time.Millisecond)
	}
	if bc["sent"] != float64(0) || bc["failed"] != float64(1) || bc["skipped"] != float64(1) ||
		!strings.Contains(bc["title"].(string), "Отмена сдачи") {
		t.Fatalf("broadcast counters: %v", bc)
	}
	id := int64(bc["id"].(float64))
	detail := admin.do("GET", fmt.Sprintf("/api/v1/admin/broadcasts/%d", id), nil, 200)
	byStatus := map[string]map[string]any{}
	for _, d := range detail["deliveries"].([]any) {
		d := d.(map[string]any)
		byStatus[d["status"].(string)] = d
	}
	failed, skipped := byStatus["failed"], byStatus["skipped"]
	if failed == nil || failed["userId"] != float64(withTG) || failed["chatId"] != float64(990011) ||
		failed["recipient"] != "Рассылкин С Телеграмом" || failed["error"] == "" || failed["attempts"] != float64(1) ||
		!strings.Contains(failed["text"].(string), "Болезнь") {
		t.Fatalf("failed delivery: %v", failed)
	}
	if strings.Contains(failed["error"].(string), testBotToken) {
		t.Fatalf("error leaks the bot token: %v", failed["error"])
	}
	if skipped == nil || skipped["userId"] != float64(withoutTG) || skipped["error"] != "Telegram не привязан к аккаунту" {
		t.Fatalf("skipped delivery: %v", skipped)
	}

	res := admin.do("POST", fmt.Sprintf("/api/v1/admin/broadcasts/%d/retry", id), nil, 200)
	if res["retried"] != float64(1) || res["failed"] != float64(1) {
		t.Fatalf("retry: %v", res)
	}
	after := res["broadcast"].(map[string]any)
	if after["failed"] != float64(1) || after["skipped"] != float64(1) {
		t.Fatalf("after retry: %v", after)
	}
	for _, d := range after["deliveries"].([]any) {
		if d := d.(map[string]any); d["status"] == "failed" && d["attempts"] != float64(2) {
			t.Fatalf("retry must count the attempt: %v", d)
		}
	}

	admin.do("GET", "/api/v1/admin/broadcasts/999999", nil, 404)
	admin.do("POST", "/api/v1/admin/broadcasts/999999/retry", nil, 404)
	newClient(t).do("GET", "/api/v1/admin/broadcasts", nil, 401)
}
