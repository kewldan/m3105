package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"

	"github.com/kewldan/edu3105/apps/api/internal/api"
	"github.com/kewldan/edu3105/apps/api/internal/auth"
	"github.com/kewldan/edu3105/apps/api/internal/config"
	"github.com/kewldan/edu3105/apps/api/internal/db"
	"github.com/kewldan/edu3105/apps/api/internal/session"
	"github.com/kewldan/edu3105/apps/api/internal/store"
	"github.com/kewldan/edu3105/apps/api/internal/userauth"
)

const testPassword = "correct-horse-battery"
const testBotToken = "123456:TEST-BOT-TOKEN"

var srvURL string

func TestMain(m *testing.M) {
	if os.Getenv("SKIP_PG_TESTS") != "" {
		os.Exit(0)
	}
	cache := filepath.Join(os.TempDir(), "edu3105-embedded-pg")
	runtimeDir := filepath.Join(cache, "runtime")
	_ = os.RemoveAll(runtimeDir)
	pg := embeddedpostgres.NewDatabase(embeddedpostgres.DefaultConfig().
		Version(embeddedpostgres.V17).
		Port(54329).
		Username("edu").Password("edu").Database("edu").
		CachePath(filepath.Join(cache, "cache")).
		RuntimePath(runtimeDir).
		Logger(io.Discard))
	if err := pg.Start(); err != nil {
		fmt.Println("embedded postgres:", err)
		os.Exit(1)
	}
	code := run(m)
	_ = pg.Stop()
	os.Exit(code)
}

func run(m *testing.M) int {
	ctx := context.Background()
	pool, err := db.Connect(ctx, "postgres://edu:edu@localhost:54329/edu?sslmode=disable")
	if err != nil {
		fmt.Println("connect:", err)
		return 1
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool); err != nil {
		fmt.Println("migrate:", err)
		return 1
	}
	cfg := config.Config{PublicURL: "https://m3105.ru", CookieName: "edu_session", SessionTTL: time.Hour, LoginRateMax: 5, LoginRateWin: time.Minute,
		UserCookieName: "edu_user", TelegramBotToken: testBotToken, TelegramBotUsername: "m3105_bot", RPID: "m3105.ru", RPOrigins: []string{"https://m3105.ru"}, DevLogin: true}
	sessions := session.NewMemory()
	au := auth.New(sessions, auth.Options{Password: testPassword, CookieName: cfg.CookieName, TTL: cfg.SessionTTL, RateMax: 5, RateWindow: time.Minute})
	us, err := userauth.New(sessions, userauth.Options{CookieName: cfg.UserCookieName, TTL: cfg.SessionTTL, RPID: cfg.RPID, RPDisplayName: "М3105", RPOrigins: cfg.RPOrigins})
	if err != nil {
		fmt.Println("userauth:", err)
		return 1
	}
	h := api.New(store.New(pool), au, us, cfg)
	ts := httptest.NewServer(h.Router())
	defer ts.Close()
	srvURL = ts.URL
	return m.Run()
}

type client struct {
	t  *testing.T
	hc *http.Client
}

func newClient(t *testing.T) *client {
	jar, _ := cookiejar.New(nil)
	return &client{t: t, hc: &http.Client{Jar: jar}}
}

func (c *client) do(method, path string, body any, want int) map[string]any {
	c.t.Helper()
	var rdr io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rdr = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, srvURL+path, rdr)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := c.hc.Do(req)
	if err != nil {
		c.t.Fatalf("%s %s: %v", method, path, err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode != want {
		c.t.Fatalf("%s %s: status %d, want %d: %s", method, path, res.StatusCode, want, raw)
	}
	var out map[string]any
	if len(raw) > 0 && raw[0] == '{' {
		_ = json.Unmarshal(raw, &out)
	}
	return out
}

func (c *client) list(path string, want int) []map[string]any {
	c.t.Helper()
	res, err := c.hc.Get(srvURL + path)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode != want {
		c.t.Fatalf("GET %s: status %d, want %d: %s", path, res.StatusCode, want, raw)
	}
	var out []map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		c.t.Fatalf("GET %s: not a list: %s", path, raw)
	}
	return out
}

func TestEndToEnd(t *testing.T) {
	c := newClient(t)

	// Unauthenticated admin access is rejected.
	c.do("GET", "/api/v1/admin/subjects", nil, 401)
	c.do("GET", "/api/v1/auth/me", nil, 401)
	c.do("POST", "/api/v1/auth/login", map[string]string{"password": "wrong"}, 401)
	c.do("POST", "/api/v1/auth/login", map[string]string{"password": testPassword}, 200)
	c.do("GET", "/api/v1/auth/me", nil, 200)

	// Settings.
	settings := c.do("GET", "/api/v1/admin/settings", nil, 200)
	settings["semesterStart"] = "2026-09-01"
	settings["firstWeekParity"] = "odd"
	settings["siteTitle"] = "М3105"
	settings["links"] = []map[string]string{{"title": "Чат", "url": "https://t.me/example"}}
	c.do("PUT", "/api/v1/admin/settings", settings, 200)
	settings["timezone"] = "Mars/Olympus"
	c.do("PUT", "/api/v1/admin/settings", settings, 422)

	// Subjects.
	subj := c.do("POST", "/api/v1/admin/subjects", map[string]any{"name": "Программирование", "color": "blue", "teacher": "Иванов И.И."}, 201)
	if subj["slug"] != "programmirovanie" {
		t.Fatalf("unexpected slug %v", subj["slug"])
	}
	subj2 := c.do("POST", "/api/v1/admin/subjects", map[string]any{"name": "Программирование", "color": "rose"}, 201)
	if subj2["slug"] != "programmirovanie-2" {
		t.Fatalf("expected de-duplicated slug, got %v", subj2["slug"])
	}
	c.do("POST", "/api/v1/admin/subjects", map[string]any{"name": ""}, 422)
	subjectID := int64(subj["id"].(float64))
	c.do("DELETE", fmt.Sprintf("/api/v1/admin/subjects/%v", subj2["id"]), nil, 200)

	// Labs.
	deadline := time.Now().Add(72 * time.Hour).UTC().Format(time.RFC3339)
	lab := c.do("POST", "/api/v1/admin/labs", map[string]any{
		"subjectId": subjectID, "number": 1, "title": "Лабораторная №1", "summary": "Введение",
		"content": "# Задание\n\nНаписать *hello world*.", "deadlineAt": deadline, "status": "published",
		"materials": []map[string]string{{"title": "Методичка", "url": "https://example.com/m.pdf"}},
	}, 201)
	labID := int64(lab["id"].(float64))
	c.do("POST", "/api/v1/admin/labs", map[string]any{"subjectId": subjectID, "number": 2, "title": "Черновик", "status": "draft"}, 201)
	c.do("POST", "/api/v1/admin/labs", map[string]any{"subjectId": 999, "number": 1, "title": "X"}, 422)

	// Events, schedule, FAQ, pages, notes, quizzes.
	c.do("POST", "/api/v1/admin/events", map[string]any{"title": "Контрольная", "kind": "test", "subjectId": subjectID,
		"startsAt": time.Now().Add(48 * time.Hour).UTC().Format(time.RFC3339)}, 201)
	c.do("POST", "/api/v1/admin/events", map[string]any{"title": "", "startsAt": deadline}, 422)
	c.do("POST", "/api/v1/admin/faq", map[string]any{"question": "Как сдавать?", "answer": "Через **git**", "category": "Сдача"}, 201)
	c.do("POST", "/api/v1/admin/pages", map[string]any{"title": "О группе", "content": "Привет", "status": "published", "showInNav": true}, 201)
	note := c.do("POST", "/api/v1/admin/notes", map[string]any{"subjectId": subjectID, "number": 1, "title": "Лекция 1",
		"content": "# Введение\n\n$E = mc^2$", "lectureDate": "2026-09-02", "status": "published"}, 201)
	noteID := int64(note["id"].(float64))
	if note["lectureDate"] != "2026-09-02" {
		t.Fatalf("lectureDate round trip failed: %v", note["lectureDate"])
	}
	questions := []map[string]any{
		{"type": "single", "prompt": "2+2?", "options": []map[string]any{{"text": "4", "correct": true}, {"text": "5"}}, "explanation": "Арифметика"},
		{"type": "multiple", "prompt": "Чётные", "options": []map[string]any{{"text": "2", "correct": true}, {"text": "3"}, {"text": "4", "correct": true}}},
		{"type": "text", "prompt": "Столица России", "answers": []string{"Москва"}},
	}
	c.do("POST", "/api/v1/admin/quizzes/validate", map[string]any{"questions": questions}, 200)
	c.do("POST", "/api/v1/admin/quizzes/validate", map[string]any{"questions": []map[string]any{{"type": "single", "prompt": "x"}}}, 422)
	quiz := c.do("POST", "/api/v1/admin/quizzes", map[string]any{"subjectId": subjectID, "noteId": noteID, "title": "Квиз по лекции 1",
		"questions": questions, "status": "published"}, 201)
	if got := len(quiz["questions"].([]any)); got != 3 {
		t.Fatalf("expected 3 questions, got %d", got)
	}

	// Public endpoints see only published content.
	pub := newClient(t)
	pub.do("GET", "/api/v1/admin/subjects", nil, 401)
	labs := pub.list("/api/v1/labs", 200)
	if len(labs) != 1 {
		t.Fatalf("expected 1 published lab, got %d", len(labs))
	}
	labPage := pub.do("GET", "/api/v1/labs/programmirovanie/laboratornaya-1", nil, 200)
	if !strings.Contains(labPage["content"].(string), "hello world") {
		t.Fatalf("lab content missing: %v", labPage["content"])
	}
	pub.do("GET", "/api/v1/labs/programmirovanie/chernovik", nil, 404)
	subjects := pub.list("/api/v1/subjects", 200)
	if len(subjects) != 1 || subjects[0]["labsCount"].(float64) != 1 {
		t.Fatalf("unexpected subjects: %v", subjects)
	}
	subjPage := pub.do("GET", "/api/v1/subjects/programmirovanie", nil, 200)
	if len(subjPage["quizzes"].([]any)) != 1 {
		t.Fatalf("expected quiz in subject page: %v", subjPage["quizzes"])
	}
	cal := pub.do("GET", "/api/v1/calendar", nil, 200)
	calSources := map[string]bool{}
	for _, it := range cal["items"].([]any) {
		calSources[it.(map[string]any)["source"].(string)] = true
	}
	if !calSources["lab"] || !calSources["event"] {
		t.Fatalf("calendar must contain the lab deadline and the event, got %v", cal["items"])
	}
	res, err := pub.hc.Get(srvURL + "/api/v1/calendar.ics")
	if err != nil {
		t.Fatal(err)
	}
	icsBody, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if !strings.Contains(res.Header.Get("Content-Type"), "text/calendar") || !strings.Contains(string(icsBody), "BEGIN:VEVENT") {
		t.Fatalf("bad ics response: %s %s", res.Header.Get("Content-Type"), icsBody)
	}
	if !strings.Contains(string(icsBody), "https://m3105.ru/labs/programmirovanie/laboratornaya-1") {
		t.Fatalf("ics missing lab url: %s", icsBody)
	}
	home := pub.do("GET", "/api/v1/home", nil, 200)
	week := home["week"].(map[string]any)
	if week["configured"] != true {
		t.Fatalf("week should be configured: %v", week)
	}
	if len(home["upcomingDeadlines"].([]any)) != 1 {
		t.Fatalf("expected one upcoming lab deadline: %v", home["upcomingDeadlines"])
	}
	if len(home["upcomingEvents"].([]any)) != 1 {
		t.Fatalf("expected the test event under upcomingEvents: %v", home["upcomingEvents"])
	}
	settingsPub := pub.do("GET", "/api/v1/settings", nil, 200)
	if len(settingsPub["navPages"].([]any)) != 1 {
		t.Fatalf("expected nav page: %v", settingsPub["navPages"])
	}
	notePage := pub.do("GET", "/api/v1/notes/programmirovanie/lektsiya-1", nil, 200)
	if len(notePage["quizzes"].([]any)) != 1 {
		t.Fatalf("expected linked quiz: %v", notePage)
	}
	quizPage := pub.do("GET", "/api/v1/quizzes/kviz-po-lektsii-1", nil, 200)
	if quizPage["noteSlug"] != "lektsiya-1" {
		t.Fatalf("expected note slug on quiz: %v", quizPage["noteSlug"])
	}
	if faq := pub.list("/api/v1/faq", 200); len(faq) != 1 {
		t.Fatalf("expected faq: %v", faq)
	}
	pub.do("GET", "/api/v1/pages/o-gruppe", nil, 200)
	hits := pub.list("/api/v1/search?q=hello", 200)
	if len(hits) != 1 || hits[0]["kind"] != "lab" {
		t.Fatalf("unexpected search hits: %v", hits)
	}

	// Update + delete flows.
	lab["title"] = "Лабораторная №1 (обновлено)"
	lab["status"] = "draft"
	updated := c.do("PUT", fmt.Sprintf("/api/v1/admin/labs/%d", labID), lab, 200)
	if updated["title"] != "Лабораторная №1 (обновлено)" || updated["slug"] != "laboratornaya-1" {
		t.Fatalf("update failed: %v", updated)
	}
	if labs := pub.list("/api/v1/labs", 200); len(labs) != 0 {
		t.Fatalf("draft lab leaked: %v", labs)
	}
	c.do("DELETE", fmt.Sprintf("/api/v1/admin/labs/%d", labID), nil, 200)
	c.do("DELETE", fmt.Sprintf("/api/v1/admin/labs/%d", labID), nil, 404)

	// Logout invalidates the session.
	c.do("POST", "/api/v1/auth/logout", nil, 200)
	c.do("GET", "/api/v1/admin/subjects", nil, 401)

}

// userIDByName finds an account in the admin list by its shown name.
func userIDByName(t *testing.T, admin *client, name string) int64 {
	t.Helper()
	for _, u := range admin.list("/api/v1/admin/users", 200) {
		if u["name"] == name {
			return int64(u["id"].(float64))
		}
	}
	t.Fatalf("user %q not found", name)
	return 0
}

func TestStudentAccounts(t *testing.T) {
	admin := newClient(t)
	admin.do("POST", "/api/v1/auth/login", map[string]string{"password": testPassword}, 200)
	subj := admin.do("POST", "/api/v1/admin/subjects", map[string]any{"name": "Сети", "color": "teal"}, 201)
	subjectID := int64(subj["id"].(float64))
	lab1 := admin.do("POST", "/api/v1/admin/labs", map[string]any{"subjectId": subjectID, "number": 1, "title": "Сокеты", "status": "published"}, 201)
	lab2 := admin.do("POST", "/api/v1/admin/labs", map[string]any{"subjectId": subjectID, "number": 2, "title": "HTTP", "status": "published"}, 201)
	draft := admin.do("POST", "/api/v1/admin/labs", map[string]any{"subjectId": subjectID, "number": 3, "title": "Черновик"}, 201)
	lab1ID, lab2ID, draftID := int64(lab1["id"].(float64)), int64(lab2["id"].(float64)), int64(draft["id"].(float64))

	// Telegram login with a properly signed payload creates the account.
	tg := newClient(t)
	data := userauth.TelegramData{ID: 777, FirstName: "Маша", LastName: "Иванова", Username: "masha", AuthDate: time.Now().Unix()}
	data.Hash = userauth.SignTelegram(testBotToken, data)
	me := tg.do("POST", "/api/v1/auth/telegram", map[string]any{"id": data.ID, "first_name": data.FirstName, "last_name": data.LastName,
		"username": data.Username, "auth_date": data.AuthDate, "hash": data.Hash}, 200)
	if me["user"].(map[string]any)["name"] != "Маша Иванова" || me["user"].(map[string]any)["approved"] != false {
		t.Fatalf("unexpected user: %v", me["user"])
	}
	data.Hash = "deadbeef"
	tg.do("POST", "/api/v1/auth/telegram", map[string]any{"id": data.ID, "first_name": data.FirstName, "auth_date": data.AuthDate, "hash": data.Hash}, 401)
	tg.do("GET", "/api/v1/auth/user/me", nil, 200)

	// Dev login (test config enables it) and lab completion.
	u := newClient(t)
	u.do("GET", "/api/v1/auth/user/me", nil, 401)
	u.do("PUT", fmt.Sprintf("/api/v1/me/labs/%d/done", lab1ID), nil, 401)
	u.do("POST", "/api/v1/auth/dev-login", map[string]string{"name": "Петя Сидоров"}, 200)
	// New accounts wait for an admin to confirm the group: student actions are refused until then.
	u.do("PUT", fmt.Sprintf("/api/v1/me/labs/%d/done", lab1ID), nil, 403)
	admin.do("PUT", fmt.Sprintf("/api/v1/admin/users/%d", userIDByName(t, admin, "Петя Сидоров")),
		map[string]any{"displayName": strings.Repeat("я", 81), "approved": true}, 422)
	approved := admin.do("PUT", fmt.Sprintf("/api/v1/admin/users/%d", userIDByName(t, admin, "Петя Сидоров")),
		map[string]any{"displayName": "Пётр Сидоров", "groupName": "М3105", "approved": true}, 200)
	if approved["approved"] != true || approved["name"] != "Пётр Сидоров" || approved["telegramName"] != "Петя Сидоров" {
		t.Fatalf("approve failed: %v", approved)
	}
	res := u.do("PUT", fmt.Sprintf("/api/v1/me/labs/%d/done", lab1ID), nil, 200)
	if ids := res["completedLabIds"].([]any); len(ids) != 1 || int64(ids[0].(float64)) != lab1ID {
		t.Fatalf("unexpected completions: %v", ids)
	}
	u.do("PUT", fmt.Sprintf("/api/v1/me/labs/%d/done", draftID), nil, 404)
	u.do("DELETE", fmt.Sprintf("/api/v1/me/labs/%d/done", lab1ID), nil, 200)
	u.do("PUT", fmt.Sprintf("/api/v1/me/labs/%d/done", lab1ID), nil, 200)
	// The admin's display name overrides Telegram and survives the next login.
	u.do("POST", "/api/v1/auth/dev-login", map[string]string{"name": "Петя Сидоров"}, 200)
	if got := u.do("GET", "/api/v1/me/", nil, 200)["user"].(map[string]any)["name"]; got != "Пётр Сидоров" {
		t.Fatalf("display name lost: %v", got)
	}

	// Practice session with capacity 1.
	starts := time.Now().Add(3 * 24 * time.Hour).UTC().Format(time.RFC3339)
	sess := admin.do("POST", "/api/v1/admin/practice", map[string]any{"subjectId": subjectID, "startsAt": starts, "location": "412", "capacity": 1}, 201)
	sessID := int64(sess["id"].(float64))
	admin.do("POST", "/api/v1/admin/practice", map[string]any{"subjectId": subjectID, "startsAt": starts, "endsAt": time.Now().Format(time.RFC3339)}, 422)

	anon := newClient(t)
	list := anon.do("GET", "/api/v1/practice", nil, 200)
	sessions := list["sessions"].([]any)
	if len(sessions) != 1 || len(sessions[0].(map[string]any)["participants"].([]any)) != 0 {
		t.Fatalf("anonymous listing wrong: %v", list)
	}
	anon.do("PUT", fmt.Sprintf("/api/v1/practice/%d/signups", sessID), map[string]any{"labIds": []int64{lab1ID}}, 401)

	view := u.do("PUT", fmt.Sprintf("/api/v1/practice/%d/signups", sessID), map[string]any{"labIds": []int64{lab1ID, lab2ID}}, 200)
	if view["signupsCount"].(float64) != 1 || len(view["myLabIds"].([]any)) != 2 {
		t.Fatalf("signup view wrong: %v", view)
	}
	u.do("PUT", fmt.Sprintf("/api/v1/practice/%d/signups", sessID), map[string]any{"labIds": []int64{draftID}}, 422)
	// Re-signing with a different set replaces the previous choice.
	view = u.do("PUT", fmt.Sprintf("/api/v1/practice/%d/signups", sessID), map[string]any{"labIds": []int64{lab2ID}}, 200)
	if len(view["myLabIds"].([]any)) != 1 {
		t.Fatalf("replace failed: %v", view["myLabIds"])
	}
	// Second student (confirmed by the admin) hits the capacity limit.
	admin.do("PUT", fmt.Sprintf("/api/v1/admin/users/%d", userIDByName(t, admin, "Маша Иванова")), map[string]any{"approved": true}, 200)
	tg.do("PUT", fmt.Sprintf("/api/v1/practice/%d/signups", sessID), map[string]any{"labIds": []int64{lab1ID}}, 409)
	full := tg.do("GET", fmt.Sprintf("/api/v1/practice/%d", sessID), nil, 200)
	if full["full"] != true || len(full["participants"].([]any)) != 1 {
		t.Fatalf("expected full session with one participant: %v", full)
	}
	meNow := u.do("GET", "/api/v1/me/", nil, 200)
	if len(meNow["signups"].([]any)) != 1 {
		t.Fatalf("expected one signup in profile: %v", meNow["signups"])
	}
	// Practice sessions are listed as events on the home page and in the calendar.
	homeNow := anon.do("GET", "/api/v1/home", nil, 200)
	found := false
	for _, it := range homeNow["upcomingEvents"].([]any) {
		if it.(map[string]any)["source"] == "practice" {
			found = true
		}
	}
	if !found {
		t.Fatalf("practice session missing from upcomingEvents: %v", homeNow["upcomingEvents"])
	}
	cal := anon.do("GET", "/api/v1/calendar", nil, 200)
	inCal := false
	for _, it := range cal["items"].([]any) {
		if it.(map[string]any)["source"] == "practice" {
			inCal = true
		}
	}
	if !inCal {
		t.Fatalf("practice session missing from calendar: %v", cal["items"])
	}
	// Admin sees who is coming, then cancels; user cancels own signup.
	who := admin.do("GET", fmt.Sprintf("/api/v1/admin/practice/%d/signups", sessID), nil, 200)
	if len(who["participants"].([]any)) != 1 {
		t.Fatalf("admin signups wrong: %v", who)
	}
	u.do("DELETE", fmt.Sprintf("/api/v1/practice/%d/signups", sessID), nil, 200)
	if got := u.do("GET", "/api/v1/me/", nil, 200); len(got["signups"].([]any)) != 0 {
		t.Fatalf("cancel failed: %v", got["signups"])
	}
	// Comments on a published lab: anyone reads, students write, only the author deletes.
	anon.do("POST", fmt.Sprintf("/api/v1/comments/lab/%d", lab1ID), map[string]string{"body": "x"}, 401)
	u.do("POST", fmt.Sprintf("/api/v1/comments/lab/%d", draftID), map[string]string{"body": "x"}, 404)
	u.do("POST", fmt.Sprintf("/api/v1/comments/lab/%d", lab1ID), map[string]string{"body": "   "}, 422)
	u.do("POST", "/api/v1/comments/bogus/1", map[string]string{"body": "x"}, 404)
	cm := u.do("POST", fmt.Sprintf("/api/v1/comments/lab/%d", lab1ID), map[string]string{"body": "Где брать вариант?"}, 201)
	cmID := int64(cm["id"].(float64))
	if cm["mine"] != true || cm["authorName"] != "Пётр Сидоров" {
		t.Fatalf("bad comment: %v", cm)
	}
	if cl := anon.list(fmt.Sprintf("/api/v1/comments/lab/%d", lab1ID), 200); len(cl) != 1 || cl[0]["mine"] != false {
		t.Fatalf("anonymous comment list wrong: %v", cl)
	}
	other := newClient(t)
	other.do("POST", "/api/v1/auth/dev-login", map[string]string{"name": "Вася Пупкин"}, 200)
	other.do("DELETE", fmt.Sprintf("/api/v1/comments/%d", cmID), nil, 403)
	admin.do("PUT", fmt.Sprintf("/api/v1/admin/users/%d", userIDByName(t, admin, "Вася Пупкин")), map[string]any{"approved": true}, 200)

	// Posts: shawarma reviews need a rating, jokes are plain text; likes toggle; the author edits, the admin moderates.
	u.do("POST", "/api/v1/posts", map[string]any{"kind": "shawarma", "title": "Шаверма у метро", "body": "Норм"}, 422)
	u.do("POST", "/api/v1/posts", map[string]any{"kind": "meme", "body": "x"}, 422)
	sh := u.do("POST", "/api/v1/posts", map[string]any{"kind": "shawarma", "title": "Шаверма у метро", "body": "Норм", "rating": 4, "price": 250, "address": "Кронверкский 49"}, 201)
	shID := int64(sh["id"].(float64))
	joke := u.do("POST", "/api/v1/posts", map[string]any{"kind": "joke", "body": "Заходит студент в бар...", "rating": 5}, 201)
	jokeID := int64(joke["id"].(float64))
	if joke["rating"] != nil || joke["mine"] != true {
		t.Fatalf("joke should drop rating and be mine: %v", joke)
	}
	anon.do("GET", "/api/v1/posts", nil, 422)
	if feed := anon.list("/api/v1/posts?kind=shawarma", 200); len(feed) != 1 || feed[0]["likesCount"] != 0.0 || feed[0]["mine"] != false {
		t.Fatalf("shawarma feed wrong: %v", feed)
	}
	anon.do("PUT", fmt.Sprintf("/api/v1/posts/%d/like", shID), nil, 401)
	if liked := other.do("PUT", fmt.Sprintf("/api/v1/posts/%d/like", shID), nil, 200); liked["likesCount"] != 1.0 || liked["liked"] != true {
		t.Fatalf("like failed: %v", liked)
	}
	if again := other.do("PUT", fmt.Sprintf("/api/v1/posts/%d/like", shID), nil, 200); again["likesCount"] != 1.0 {
		t.Fatalf("like must be idempotent: %v", again)
	}
	if unliked := other.do("DELETE", fmt.Sprintf("/api/v1/posts/%d/like", shID), nil, 200); unliked["likesCount"] != 0.0 || unliked["liked"] != false {
		t.Fatalf("unlike failed: %v", unliked)
	}
	other.do("PUT", fmt.Sprintf("/api/v1/posts/%d", shID), map[string]any{"title": "Чужая", "body": "x", "rating": 1}, 403)
	other.do("DELETE", fmt.Sprintf("/api/v1/posts/%d", shID), nil, 403)
	if edited := u.do("PUT", fmt.Sprintf("/api/v1/posts/%d", shID), map[string]any{"kind": "joke", "title": "Шаверма у метро 2", "body": "Стало лучше", "rating": 5}, 200); edited["title"] != "Шаверма у метро 2" || edited["kind"] != "shawarma" {
		t.Fatalf("edit failed or kind changed: %v", edited)
	}
	other.do("POST", fmt.Sprintf("/api/v1/comments/post/%d", shID), map[string]string{"body": "Согласен"}, 201)
	if top := anon.list("/api/v1/posts?kind=shawarma&sort=top", 200); top[0]["commentsCount"] != 1.0 {
		t.Fatalf("comments count wrong: %v", top)
	}
	if ac := admin.list("/api/v1/admin/comments", 200); len(ac) != 2 || ac[0]["targetPath"] == nil {
		t.Fatalf("admin comments wrong: %v", ac)
	}
	admin.do("DELETE", fmt.Sprintf("/api/v1/admin/comments/%d", cmID), nil, 200)
	if got := admin.do("PUT", fmt.Sprintf("/api/v1/admin/posts/%d", jokeID), map[string]any{"body": "Отредактировано админом"}, 200); got["body"] != "Отредактировано админом" {
		t.Fatalf("admin edit failed: %v", got)
	}
	if all := admin.list("/api/v1/admin/posts", 200); len(all) != 2 {
		t.Fatalf("admin posts wrong: %v", all)
	}
	admin.do("DELETE", fmt.Sprintf("/api/v1/admin/posts/%d", shID), nil, 200)
	if left := anon.list("/api/v1/posts?kind=shawarma", 200); len(left) != 0 {
		t.Fatalf("post not deleted: %v", left)
	}
	anon.do("GET", fmt.Sprintf("/api/v1/comments/post/%d", shID), nil, 404)
	u.do("DELETE", fmt.Sprintf("/api/v1/posts/%d", jokeID), nil, 200)

	// Anti-spam: comments and posts share one per-user limit inside the window.
	prevLimit := api.SetSocialWriteLimit(2)
	other.do("POST", "/api/v1/posts", map[string]any{"kind": "joke", "body": "Второй"}, 201) // other's earlier comment died with the deleted post
	other.do("POST", fmt.Sprintf("/api/v1/comments/lab/%d", lab1ID), map[string]string{"body": "Третий"}, 201)
	other.do("POST", "/api/v1/posts", map[string]any{"kind": "joke", "body": "Лишний"}, 429)
	other.do("POST", fmt.Sprintf("/api/v1/comments/lab/%d", lab1ID), map[string]string{"body": "Лишний"}, 429)
	other.do("PUT", fmt.Sprintf("/api/v1/posts/%d", shID), nil, 404) // limit does not affect other actions; post is gone
	api.SetSocialWriteLimit(prevLimit)

	// Passkey ceremonies produce options; a garbage credential is rejected.
	begin := u.do("POST", "/api/v1/auth/passkey/register/begin", map[string]any{}, 200)
	if begin["challengeId"] == nil || begin["options"].(map[string]any)["challenge"] == nil {
		t.Fatalf("bad register begin: %v", begin)
	}
	u.do("POST", "/api/v1/auth/passkey/register/finish", map[string]any{"challengeId": begin["challengeId"], "credential": map[string]any{"id": "x"}}, 400)
	// Passkeys can only be added to an existing (Telegram) account.
	anon.do("POST", "/api/v1/auth/passkey/register/begin", map[string]any{}, 401)
	loginBegin := anon.do("POST", "/api/v1/auth/passkey/login/begin", nil, 200)
	if loginBegin["options"].(map[string]any)["challenge"] == nil {
		t.Fatalf("bad login begin: %v", loginBegin)
	}
	anon.do("POST", "/api/v1/auth/passkey/login/finish", map[string]any{"challengeId": "nope", "credential": map[string]any{}}, 400)

	// Invite code: a correct one confirms a new account right away, a wrong one is
	// rejected, none at all creates a pending account for the admin to confirm.
	settings := admin.do("GET", "/api/v1/admin/settings", nil, 200)
	settings["inviteCode"] = "secret"
	admin.do("PUT", "/api/v1/admin/settings", settings, 200)
	pub := anon.do("GET", "/api/v1/settings", nil, 200)
	if pub["auth"].(map[string]any)["inviteRequired"] != true || pub["settings"].(map[string]any)["inviteCode"] != "" {
		t.Fatalf("invite exposure wrong: %v", pub)
	}
	newbie := newClient(t)
	newbie.do("POST", "/api/v1/auth/dev-login", map[string]string{"name": "Гость", "inviteCode": "wrong"}, 403)
	if got := newbie.do("POST", "/api/v1/auth/dev-login", map[string]string{"name": "Гость"}, 200)["user"].(map[string]any); got["approved"] != false || got["groupName"] != "М3105" {
		t.Fatalf("pending account wrong: %v", got)
	}
	invited := newClient(t)
	if got := invited.do("POST", "/api/v1/auth/dev-login", map[string]string{"name": "Гостья", "inviteCode": "secret"}, 200)["user"].(map[string]any); got["approved"] != true {
		t.Fatalf("invited account not approved: %v", got)
	}
	u.do("POST", "/api/v1/auth/dev-login", map[string]string{"name": "Петя Сидоров"}, 200) // existing account, no code needed

	// Admin user management.
	users := admin.list("/api/v1/admin/users", 200)
	if len(users) != 5 {
		t.Fatalf("expected 5 users, got %d", len(users))
	}
	if ov := admin.do("GET", "/api/v1/admin/overview", nil, 200); ov["pendingUsers"] != float64(1) {
		t.Fatalf("expected 1 pending user, got %v", ov["pendingUsers"])
	}
	admin.do("DELETE", fmt.Sprintf("/api/v1/admin/users/%v", users[0]["id"]), nil, 200)
	u.do("POST", "/api/v1/auth/user/logout", nil, 200)
	u.do("GET", "/api/v1/auth/user/me", nil, 401)
}

// Runs last: the per-IP counter is shared by every test in this process.
func TestLoginRateLimit(t *testing.T) {
	// Rate limiting kicks in after too many failures (the counter is per IP,
	// so earlier login calls in this test already count towards the limit).
	rl := newClient(t)
	limited := false
	for i := 0; i < 8 && !limited; i++ {
		b, _ := json.Marshal(map[string]string{"password": "nope"})
		res, err := rl.hc.Post(srvURL+"/api/v1/auth/login", "application/json", bytes.NewReader(b))
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		switch res.StatusCode {
		case 401:
		case 429:
			limited = true
		default:
			t.Fatalf("unexpected login status %d", res.StatusCode)
		}
	}
	if !limited {
		t.Fatal("expected rate limiting after repeated failures")
	}
	rl.do("POST", "/api/v1/auth/login", map[string]string{"password": testPassword}, 429)
}

func TestOpenAPISpec(t *testing.T) {
	res, err := http.Get(srvURL + "/api/v1/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status %d", res.StatusCode)
	}
	if ct := res.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/yaml") {
		t.Fatalf("content-type %q", ct)
	}
	body := string(raw)
	for _, want := range []string{"openapi: 3.1.0", "/subjects/{slug}:", "/calendar.ics:", "PracticeListResponse:"} {
		if !strings.Contains(body, want) {
			t.Fatalf("spec lacks %q", want)
		}
	}
	docs, err := http.Get(srvURL + "/api/v1/docs")
	if err != nil {
		t.Fatal(err)
	}
	defer docs.Body.Close()
	if docs.StatusCode != http.StatusOK || !strings.HasPrefix(docs.Header.Get("Content-Type"), "text/html") {
		t.Fatalf("docs: status %d, content-type %q", docs.StatusCode, docs.Header.Get("Content-Type"))
	}
}
