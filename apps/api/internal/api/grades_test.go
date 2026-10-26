package api_test

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// fakeSheet — содержимое вкладок фейковой Google-таблицы по gid.
var fakeSheet = struct {
	sync.Mutex
	tabs map[string]string
}{tabs: map[string]string{}}

func setFakeTab(gid, csv string) {
	fakeSheet.Lock()
	defer fakeSheet.Unlock()
	fakeSheet.tabs[gid] = csv
}

// fakeSheets отвечает как docs.google.com: HTML-вид со списком вкладок и CSV-экспорт.
func fakeSheets() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/htmlview"):
			fmt.Fprint(w, `<script>var items = [];`+
				`items.push({name: "M3105", pageUrl: "https:\/\/docs.google.com\/x?headers\x3dtrue&gid=11", gid: "11",initialSheet: false});`+
				`items.push({name: "M3104", pageUrl: "https:\/\/docs.google.com\/x?gid=12", gid: "12",initialSheet: false});`+
				`items.push({name: "Статистика", pageUrl: "x", gid: "13",initialSheet: false});</script>`)
		case strings.HasSuffix(r.URL.Path, "/export"):
			fakeSheet.Lock()
			body, ok := fakeSheet.tabs[r.URL.Query().Get("gid")]
			fakeSheet.Unlock()
			if !ok {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", "text/csv")
			fmt.Fprint(w, body)
		default:
			http.NotFound(w, r)
		}
	}))
}

const gradesHeader = ",ФИО, github,-,+,D,12,1,-,+,D,12,2,Live,Лабы,Экзамен,Итог,ИСУ\n"

func TestGrades(t *testing.T) {
	setFakeTab("11", gradesHeader+
		`1,Грейдов Георгий Ильич,ivan,2,,0,12,"11,04",,,,,0,,"11,04",,"11,04",100001`+"\n"+
		`2,Баллов Борис Борисович,petr,,2,0,12,"12,96",,,0,12,12,,"24,96",,"24,96",100002`+"\n"+
		`3,Рейтингова Анна Сергеевна,anna,,,,,0,,,,,0,,0,,0,100003`+"\n")
	setFakeTab("12", gradesHeader+
		`1,Таблицын Артур Иванович,art,,,0,12,12,,,0,12,12,,24,,24,100004`+"\n")
	setFakeTab("13", ",,,\n,,2,3,4,5\n,M3101,5,0,0\n")

	admin := newClient(t).bearer(testAPIToken)
	subj := admin.do("POST", "/api/v1/admin/subjects", map[string]any{"name": "Программирование", "color": "blue"}, 201)
	subjectID := int64(subj["id"].(float64))
	t.Cleanup(func() { admin.do("DELETE", fmt.Sprintf("/api/v1/admin/subjects/%d", subjectID), nil, 200) })

	cols := []map[string]any{
		{"key": "lab1", "label": "Лаба 1", "header": "1", "max": 12},
		{"key": "lab2", "label": "Лаба 2", "header": "2", "max": 12},
		{"key": "exam", "label": "Экзамен", "header": "Экзамен", "max": 40},
	}
	src := map[string]any{"subjectId": subjectID, "spreadsheet": "не ссылка", "syncHours": 3, "enabled": true,
		"nameColumn": "ФИО", "idColumn": "ИСУ", "totalColumn": "Итог", "columns": cols}
	admin.do("POST", "/api/v1/admin/grade-sources", src, 422)
	src["spreadsheet"] = "https://docs.google.com/spreadsheets/d/1RPnkkIYz1yWKvegiurVcmc-UIvRXBZZ7OqjRtw_gI9E/edit?gid=616990927#gid=616990927"
	created := admin.do("POST", "/api/v1/admin/grade-sources", src, 201)
	if created["spreadsheetId"] != "1RPnkkIYz1yWKvegiurVcmc-UIvRXBZZ7OqjRtw_gI9E" {
		t.Fatalf("id not extracted from the link: %v", created["spreadsheetId"])
	}
	sourceID := int64(created["id"].(float64))

	res := admin.do("POST", fmt.Sprintf("/api/v1/admin/grade-sources/%d/sync", sourceID), nil, 200)
	if res["rows"] != float64(4) || len(res["tabs"].([]any)) != 2 || len(res["skipped"].([]any)) != 1 {
		t.Fatalf("unexpected sync result: %v", res)
	}

	// Рейтинг открыт всем: и гостю без входа, и неподтверждённому аккаунту.
	if guest := newClient(t).do("GET", "/api/v1/grades", nil, 200); len(guest["rows"].([]any)) != 4 {
		t.Fatalf("guest rating: %v", guest)
	}
	u := newClient(t)
	u.do("POST", "/api/v1/auth/dev-login", map[string]string{"name": "Боря Тестов"}, 200)
	uid := userIDByName(t, admin, "Боря Тестов")
	admin.do("PUT", fmt.Sprintf("/api/v1/admin/users/%d", uid), map[string]any{"displayName": "", "groupName": "", "approved": false}, 200)
	u.do("GET", "/api/v1/grades", nil, 200)
	admin.do("PUT", fmt.Sprintf("/api/v1/admin/users/%d", uid), map[string]any{"displayName": "", "groupName": "М3105", "approved": true}, 200)

	page := u.do("GET", "/api/v1/grades", nil, 200)
	rows := page["rows"].([]any)
	if len(rows) != 4 || page["linked"] != false {
		t.Fatalf("unexpected rating: %v", page)
	}
	first := rows[0].(map[string]any)
	if first["name"] != "Баллов Борис" || first["total"] != 24.96 || first["group"] != "М3105" {
		t.Fatalf("rows not sorted or not shortened: %v", first)
	}
	for _, r := range rows {
		if _, leaked := r.(map[string]any)["isu"]; leaked {
			t.Fatal("ISU numbers must not reach other students")
		}
	}

	// Номер ИСУ: чужой формат не принимается, свой привязывает строку.
	u.do("PUT", "/api/v1/me/profile", map[string]any{"displayName": "Боря Тестов", "isu": "12ab"}, 422)
	me := u.do("PUT", "/api/v1/me/profile", map[string]any{"displayName": "Боря Тестов", "isu": "100002"}, 200)
	grades := me["grades"].([]any)
	if len(grades) != 1 {
		t.Fatalf("profile grades: %v", me["grades"])
	}
	g := grades[0].(map[string]any)
	if g["total"] != 24.96 || g["course"].(map[string]any)["rank"] != float64(1) ||
		g["inGroup"].(map[string]any)["size"] != float64(3) || g["site"].(map[string]any)["size"] != float64(1) {
		t.Fatalf("unexpected profile grade: %v", g)
	}
	if lab2 := g["parts"].(map[string]any)["lab2"]; lab2 != float64(12) {
		t.Fatalf("parts: %v", g["parts"])
	}
	// Отправка профиля без isu не отвязывает номер.
	if got := u.do("PUT", "/api/v1/me/profile", map[string]any{"displayName": "Боря Тестов"}, 200)["user"].(map[string]any)["isu"]; got != "100002" {
		t.Fatalf("isu lost: %v", got)
	}
	page = u.do("GET", fmt.Sprintf("/api/v1/grades?source=%d", sourceID), nil, 200)
	if mine := page["rows"].([]any)[0].(map[string]any); mine["me"] != true || mine["user"] == nil {
		t.Fatalf("own row not marked: %v", mine)
	}

	// Таблица одной группы (как английский) видна только тем, кто в ней есть.
	only := map[string]any{"subjectId": subjectID, "title": "Английский", "spreadsheet": src["spreadsheet"], "tabPattern": "^M3104$",
		"syncHours": 3, "enabled": true, "membersOnly": true, "nameColumn": "ФИО", "idColumn": "ИСУ", "totalColumn": "", "columns": cols}
	onlyID := int64(admin.do("POST", "/api/v1/admin/grade-sources", only, 201)["id"].(float64))
	if res := admin.do("POST", fmt.Sprintf("/api/v1/admin/grade-sources/%d/sync", onlyID), nil, 200); res["rows"] != float64(1) {
		t.Fatalf("members-only sync: %v", res)
	}
	page = u.do("GET", fmt.Sprintf("/api/v1/grades?source=%d", onlyID), nil, 200)
	if page["source"].(map[string]any)["id"] == float64(onlyID) || len(page["sources"].([]any)) != 1 {
		t.Fatalf("members-only source shown to a student who is not in it: %v", page["sources"])
	}
	admin.do("DELETE", fmt.Sprintf("/api/v1/admin/grade-sources/%d", onlyID), nil, 200)

	// Тот же номер у второго аккаунта — ошибка поля.
	v := newClient(t)
	v.do("POST", "/api/v1/auth/dev-login", map[string]string{"name": "Георгий Грейдов"}, 200)
	v.do("PUT", "/api/v1/me/profile", map[string]any{"displayName": "Георгий Грейдов", "isu": "100002"}, 422)

	// Автосопоставление: подтверждённый аккаунт «Георгий Грейдов» из М3105 получает номер по ФИО.
	vid := userIDByName(t, admin, "Георгий Грейдов")
	admin.do("PUT", fmt.Sprintf("/api/v1/admin/users/%d", vid), map[string]any{"displayName": "", "groupName": "М3105", "approved": true}, 200)
	setFakeTab("11", gradesHeader+
		`1,Грейдов Георгий Ильич,ivan,2,,0,12,"11,04",,,0,12,12,,"23,04",,"23,04",100001`+"\n"+
		`2,Баллов Борис Борисович,petr,,2,0,12,"12,96",,,0,12,12,,"24,96",,"24,96",100002`+"\n")
	res = admin.do("POST", fmt.Sprintf("/api/v1/admin/grade-sources/%d/sync", sourceID), nil, 200)
	if res["rows"] != float64(3) {
		t.Fatalf("removed row is still there: %v", res)
	}
	if got := v.do("GET", "/api/v1/me/", nil, 200)["user"].(map[string]any)["isu"]; got != "100001" {
		t.Fatalf("not linked by name: %v", got)
	}

	// Отвязанный вручную номер автоматически не возвращается.
	v.do("PUT", "/api/v1/me/profile", map[string]any{"displayName": "Георгий Грейдов", "isu": ""}, 200)
	admin.do("POST", fmt.Sprintf("/api/v1/admin/grade-sources/%d/sync", sourceID), nil, 200)
	if got := v.do("GET", "/api/v1/me/", nil, 200)["user"].(map[string]any)["isu"]; got != "" {
		t.Fatalf("unlinked account was linked again: %v", got)
	}

	// Правка настроек (новый столбец) — не изменение баллов: бот молчит.
	// Изменение в таблице после этого — изменение.
	pending := func() int {
		var n int
		if err := testPool.QueryRow(context.Background(), `SELECT count(*) FROM grade_rows WHERE source_id = $1
			AND (notified_total IS DISTINCT FROM total OR jsonb_strip_nulls(notified_parts) <> jsonb_strip_nulls(parts))`, sourceID).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if n := pending(); n != 1 {
		t.Fatalf("score change before the edit: %d pending, want 1", n)
	}
	src["columns"] = append(cols, map[string]any{"key": "live", "label": "Лайвкодинг", "header": "Live", "max": 10})
	admin.do("PUT", fmt.Sprintf("/api/v1/admin/grade-sources/%d", sourceID), src, 200)
	admin.do("POST", fmt.Sprintf("/api/v1/admin/grade-sources/%d/sync", sourceID), nil, 200)
	if n := pending(); n != 0 {
		t.Fatalf("settings edit counted as a score change: %d pending", n)
	}
	setFakeTab("11", gradesHeader+
		`1,Грейдов Георгий Ильич,ivan,2,,0,12,"11,04",,,0,12,12,5,"28,04",,"28,04",100001`+"\n"+
		`2,Баллов Борис Борисович,petr,,2,0,12,"12,96",,,0,12,12,,"24,96",,"24,96",100002`+"\n")
	admin.do("POST", fmt.Sprintf("/api/v1/admin/grade-sources/%d/sync", sourceID), nil, 200)
	if n := pending(); n != 1 {
		t.Fatalf("score change after the edit: %d pending, want 1", n)
	}

	// Сломанная таблица: старые строки остаются, ошибка видна в админке.
	setFakeTab("11", "совсем,не,то\n")
	setFakeTab("12", "совсем,не,то\n")
	admin.do("POST", fmt.Sprintf("/api/v1/admin/grade-sources/%d/sync", sourceID), nil, 502)
	got := admin.do("GET", fmt.Sprintf("/api/v1/admin/grade-sources/%d", sourceID), nil, 200)
	if got["syncError"] == "" || got["rowsCount"] != float64(3) || got["linkedCount"] != float64(1) {
		t.Fatalf("failed sync state: %v", got)
	}
}
