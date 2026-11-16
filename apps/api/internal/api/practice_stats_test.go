package api_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/grades"
	"github.com/kewldan/edu3105/apps/api/internal/store"
)

// Кому и когда поставили оценку — из таблицы баллов: на каждом синке строки
// сравниваются с прошлыми, приём лабы и теормин попадают в журнал, а статистика
// приёма относит их к сдаче предмета.
func TestGradeChangesStats(t *testing.T) {
	empty := func(n, name, isu string) string { return n + "," + name + ",x,,,,,,,,,,,,0,,0," + isu + "\n" }
	setFakeTab("11", gradesHeader+empty("1", "Журналов Георгий Ильич", "200001")+empty("2", "Сдачин Борис Борисович", "200002"))
	setFakeTab("12", gradesHeader+empty("1", "Другой Артур Иванович", "200003"))
	setFakeTab("13", ",,,\n")

	admin := newClient(t).bearer(testAPIToken)
	subj := admin.do("POST", "/api/v1/admin/subjects", map[string]any{"name": "Программирование", "color": "blue", "theoryMin": true}, 201)
	subjectID := int64(subj["id"].(float64))
	t.Cleanup(func() { admin.do("DELETE", fmt.Sprintf("/api/v1/admin/subjects/%d", subjectID), nil, 200) })
	start := time.Now().Add(-20 * time.Minute).UTC()
	sess := admin.do("POST", "/api/v1/admin/practice", map[string]any{"subjectId": subjectID, "startsAt": start.Format(time.RFC3339),
		"endsAt": start.Add(90 * time.Minute).Format(time.RFC3339), "capacity": 10}, 201)
	sessID := sess["id"].(float64)

	cols := []map[string]any{
		{"key": "lab1", "label": "Лаба 1", "header": "1", "max": 12},
		{"key": "lab2", "label": "Лаба 2", "header": "2", "max": 12},
	}
	src := admin.do("POST", "/api/v1/admin/grade-sources", map[string]any{"subjectId": subjectID, "syncHours": 3, "enabled": true,
		"spreadsheet": "https://docs.google.com/spreadsheets/d/1RPnkkIYz1yWKvegiurVcmc-UIvRXBZZ7OqjRtw_gI9E/edit",
		"nameColumn":  "ФИО", "idColumn": "ИСУ", "totalColumn": "Итог", "columns": cols,
		"scheme": map[string]any{"theory": "12", "plus": "+", "minus": "-", "late": "D", "lateFactors": []float64{1}}}, 201)
	syncURL := fmt.Sprintf("/api/v1/admin/grade-sources/%d/sync", int64(src["id"].(float64)))
	admin.do("POST", syncURL, nil, 200)
	// Первый синк — точка отсчёта: изменений нет.
	if got := admin.list("/api/v1/admin/practice/stats", 200); len(got) != 0 {
		t.Fatalf("baseline must not record changes: %v", got)
	}

	// Пока идёт сдача, таблица предмета синкается каждые пару минут.
	st := store.New(testPool)
	ctx := context.Background()
	due, err := st.ListDueGradeSources(ctx, time.Now().Add(grades.LiveSyncEvery+time.Second), grades.LiveSyncEvery)
	if err != nil || len(due) != 1 || due[0].SubjectID != subjectID {
		t.Fatalf("live sync not due: %v %v", due, err)
	}
	if due, _ := st.ListDueGradeSources(ctx, time.Now().Add(3*time.Hour), grades.LiveSyncEvery); len(due) != 1 {
		t.Fatalf("regular sync not due: %v", due)
	}

	// Георгию приняли лабу 1 (ступень просрочки 0), Борису зачли теормин по лабе 2.
	setFakeTab("11", gradesHeader+
		"1,Журналов Георгий Ильич,x,,,0,,,,,,,,,0,,0,200001\n"+
		"2,Сдачин Борис Борисович,x,,,,,,,,,12,12,,12,,12,200002\n")
	admin.do("POST", syncURL, nil, 200)
	admin.do("POST", syncURL, nil, 200) // повторный синк не дублирует

	stats := admin.list("/api/v1/admin/practice/stats", 200)
	if len(stats) != 1 || stats[0]["theoryMin"] != true {
		t.Fatalf("stats wrong: %v", stats)
	}
	ss := stats[0]["sessions"].([]any)
	if len(ss) != 1 {
		t.Fatalf("sessions wrong: %v", ss)
	}
	s := ss[0].(map[string]any)
	labs, th := s["labs"].(map[string]any), s["theory"].(map[string]any)
	if s["id"] != sessID || s["finished"] != false || labs["graded"] != 1.0 || labs["inSession"] != 1.0 ||
		labs["minutesEach"] == nil || th["graded"] != 1.0 {
		t.Fatalf("session stats wrong: %v", s)
	}
	changes := s["changes"].([]any)
	if len(changes) != 2 {
		t.Fatalf("changes wrong: %v", changes)
	}
	byKind := map[string]map[string]any{}
	for _, c := range changes {
		byKind[c.(map[string]any)["kind"].(string)] = c.(map[string]any)
	}
	if c := byKind["lab"]; c["name"] != "Журналов Георгий" || c["label"] != "Лаба 1" || c["group"] != "М3105" || c["prevSyncAt"] == nil {
		t.Fatalf("lab change wrong: %v", c)
	}
	if c := byKind["theory"]; c["name"] != "Сдачин Борис" || c["label"] != "Лаба 2" {
		t.Fatalf("theory change wrong: %v", c)
	}
	// Сдача для другой группы изменения М3105 не забирает.
	admin.do("PUT", fmt.Sprintf("/api/v1/admin/practice/%d", int64(sessID)), map[string]any{"subjectId": subjectID,
		"startsAt": start.Format(time.RFC3339), "endsAt": start.Add(90 * time.Minute).Format(time.RFC3339), "audience": []string{"group:М3104"}}, 200)
	if got := admin.list("/api/v1/admin/practice/stats", 200); len(got) != 0 {
		t.Fatalf("changes of another group: %v", got)
	}
}
