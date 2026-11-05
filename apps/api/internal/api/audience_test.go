package api_test

import (
	"fmt"
	"slices"
	"strings"
	"testing"
	"time"
)

// Материалы с аудиторией: ?for=<группа> оставляет общие, для группы и для её потока.
func TestAudience(t *testing.T) {
	admin := newClient(t).bearer(testAPIToken)
	admin.do("POST", "/api/v1/admin/students/import", map[string]string{"text": "ИСУ\tФИО\tПоток\tГруппа\n" +
		"900001\tАудитов Тест Тестович\t9\tM3191\n900002\tВторов Тест Тестович\t9\tM3192\n900003\tТретьев Тест\t8\tM3181\n"}, 200)
	groups := admin.list("/api/v1/admin/study-groups", 200)
	found := 0
	for _, g := range groups {
		if (g["name"] == "М3191" && g["stream"] == float64(9)) || (g["name"] == "М3181" && g["stream"] == float64(8)) {
			found++
		}
	}
	if found != 2 {
		t.Fatalf("study groups: %v", groups)
	}

	subj := admin.do("POST", "/api/v1/admin/subjects", map[string]any{"name": "Поточный предмет", "color": "blue", "audience": []string{"stream:9"}}, 201)
	subjectID, slug := int64(subj["id"].(float64)), subj["slug"].(string)
	t.Cleanup(func() { admin.do("DELETE", fmt.Sprintf("/api/v1/admin/subjects/%d", subjectID), nil, 200) })

	admin.do("POST", "/api/v1/admin/labs", map[string]any{"subjectId": subjectID, "number": 9, "title": "Плохая", "audience": []string{"всем"}}, 422)
	deadline := time.Now().Add(5 * 24 * time.Hour).UTC().Format(time.RFC3339)
	lab := func(title string, audience []string) string {
		got := admin.do("POST", "/api/v1/admin/labs", map[string]any{"subjectId": subjectID, "number": 1, "title": title,
			"status": "published", "deadlineAt": deadline, "audience": audience}, 201)
		return got["title"].(string)
	}
	lab("Общая", nil)
	lab("Потоку 9", []string{"stream:9"})
	if got := admin.do("POST", "/api/v1/admin/labs", map[string]any{"subjectId": subjectID, "number": 1, "title": "Группе 3192",
		"status": "published", "audience": []string{" group:m3192 ", "group:М3192"}}, 201)["audience"].([]any); len(got) != 1 || got[0] != "group:М3192" {
		t.Fatalf("audience not normalised: %v", got)
	}
	lab("Потоку 8", []string{"stream:8"})

	titles := func(path string) []string {
		var out []string
		for _, l := range newClient(t).list(path, 200) {
			out = append(out, l["title"].(string))
		}
		slices.Sort(out)
		return out
	}
	for _, c := range []struct {
		group string
		want  []string
	}{
		{"", []string{"Группе 3192", "Общая", "Потоку 8", "Потоку 9"}},
		{"М3191", []string{"Общая", "Потоку 9"}},
		{"m3192", []string{"Группе 3192", "Общая", "Потоку 9"}},
		{"М3181", []string{"Общая", "Потоку 8"}},
		{"М9999", []string{"Общая"}},
	} {
		if got := titles(fmt.Sprintf("/api/v1/labs?subject=%s&for=%s", slug, c.group)); !slices.Equal(got, c.want) {
			t.Errorf("labs for %q: %v, want %v", c.group, got, c.want)
		}
	}

	// Предмет потока 9 чужому потоку не показывается, а дедлайны в календаре фильтруются так же.
	hasSubject := func(group string) bool {
		for _, s := range newClient(t).list("/api/v1/subjects?for="+group, 200) {
			if s["slug"] == slug {
				return true
			}
		}
		return false
	}
	if !hasSubject("М3191") || hasSubject("М3181") || !hasSubject("") {
		t.Fatal("subject audience is not applied")
	}
	cal := newClient(t).do("GET", "/api/v1/calendar?subject="+slug+"&for=М3181", nil, 200)["items"].([]any)
	var calTitles []string
	for _, it := range cal {
		calTitles = append(calTitles, it.(map[string]any)["title"].(string))
	}
	if len(calTitles) != 2 || slices.ContainsFunc(calTitles, func(s string) bool { return strings.Contains(s, "Потоку 9") }) ||
		!slices.ContainsFunc(calTitles, func(s string) bool { return strings.Contains(s, "Потоку 8") }) {
		t.Fatalf("calendar for М3181: %v", calTitles)
	}
}
