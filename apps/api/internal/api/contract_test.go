package api_test

import (
	"fmt"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	yaml "go.yaml.in/yaml/v3"

	"github.com/kewldan/edu3105/apps/api/internal/api"
	"github.com/kewldan/edu3105/apps/api/internal/config"
)

// Контракт между тремя местами, которые раньше приходилось править руками:
// Go-хендлеры, openapi.yaml и типы фронтенда. Спека — источник правды: из неё
// генерируются типы (`bun run codegen`), поэтому тесты ниже следят, чтобы она
// не расходилась ни с роутером, ни с реальными ответами.

type openapiSpec struct {
	Paths      map[string]map[string]any `yaml:"paths"`
	Components struct {
		Schemas map[string]any `yaml:"schemas"`
	} `yaml:"components"`
}

func loadSpec(t *testing.T) openapiSpec {
	t.Helper()
	raw, err := os.ReadFile("openapi.yaml")
	if err != nil {
		t.Fatalf("не прочитать спеку: %v", err)
	}
	var s openapiSpec
	if err := yaml.Unmarshal(raw, &s); err != nil {
		t.Fatalf("спека не парсится: %v", err)
	}
	return s
}

// schemaFields собирает свойства схемы, разворачивая $ref и allOf.
func (s openapiSpec) schemaFields(t *testing.T, name string) (props map[string]bool, required []string) {
	t.Helper()
	props = map[string]bool{}
	var walk func(node any, depth int)
	walk = func(node any, depth int) {
		if depth > 10 {
			t.Fatalf("схема %s: слишком глубокая вложенность $ref", name)
		}
		m, ok := node.(map[string]any)
		if !ok {
			return
		}
		if ref, ok := m["$ref"].(string); ok {
			target := strings.TrimPrefix(ref, "#/components/schemas/")
			walk(s.Components.Schemas[target], depth+1)
			return
		}
		if all, ok := m["allOf"].([]any); ok {
			for _, part := range all {
				walk(part, depth+1)
			}
		}
		if p, ok := m["properties"].(map[string]any); ok {
			for key := range p {
				props[key] = true
			}
		}
		if req, ok := m["required"].([]any); ok {
			for _, r := range req {
				if name, ok := r.(string); ok {
					required = append(required, name)
				}
			}
		}
	}
	schema, ok := s.Components.Schemas[name]
	if !ok {
		t.Fatalf("схемы %s нет в спеке", name)
	}
	walk(schema, 0)
	return props, required
}

// assertMatchesSchema проверяет ответ в обе стороны: лишних полей нет и
// обязательные на месте.
func assertMatchesSchema(t *testing.T, s openapiSpec, schema string, obj map[string]any) {
	t.Helper()
	props, required := s.schemaFields(t, schema)
	var extra []string
	for key := range obj {
		if !props[key] {
			extra = append(extra, key)
		}
	}
	sort.Strings(extra)
	if len(extra) > 0 {
		t.Errorf("%s: API отдаёт поля, которых нет в openapi.yaml: %v", schema, extra)
	}
	for _, key := range required {
		if _, ok := obj[key]; !ok {
			t.Errorf("%s: спека требует поле %q, но API его не отдал", schema, key)
		}
	}
}

// TestSpecCoversPublicRoutes: каждый публичный GET описан в спеке.
func TestSpecCoversPublicRoutes(t *testing.T) {
	spec := loadSpec(t)
	// Служебное и приватное в публичную спеку не входит.
	skip := regexp.MustCompile(`^/api/v1/(admin|auth|me)(/|$)|^/api/v1/docs$|^/api/v1/openapi\.yaml$|^/healthz$`)

	router, ok := api.New(nil, nil, nil, config.Config{}, nil).Router().(chi.Routes)
	if !ok {
		t.Fatal("роутер больше не chi.Routes, тест надо обновить")
	}
	var undocumented []string
	err := chi.Walk(router, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		if method != "GET" || skip.MatchString(route) {
			return nil
		}
		path := strings.TrimSuffix(strings.TrimPrefix(route, "/api/v1"), "/")
		if path == "" {
			path = "/"
		}
		if _, ok := spec.Paths[path]; !ok {
			undocumented = append(undocumented, path)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("обход роутера: %v", err)
	}
	sort.Strings(undocumented)
	if len(undocumented) > 0 {
		t.Errorf("публичные маршруты без описания в openapi.yaml: %v", undocumented)
	}
}

// TestCacheTagsMatchFrontend: теги, которые шлёт Go, должны быть известны фронту,
// иначе сброс кеша молча ничего не делает.
func TestCacheTagsMatchFrontend(t *testing.T) {
	raw, err := os.ReadFile("../../../web/lib/api/tags.ts")
	if err != nil {
		t.Skipf("фронтенд рядом не лежит, пропускаю: %v", err)
	}
	known := map[string]bool{}
	for _, m := range regexp.MustCompile(`(?m)^\s+(\w+):\s*"(\w+)"`).FindAllStringSubmatch(string(raw), -1) {
		known[m[2]] = true
	}
	if len(known) == 0 {
		t.Fatal("в tags.ts не нашлось ни одного тега — изменился формат файла")
	}
	for _, path := range []string{
		"/api/v1/admin/subjects/1", "/api/v1/admin/labs/1", "/api/v1/admin/notes/1",
		"/api/v1/admin/quizzes/1", "/api/v1/admin/faq/1", "/api/v1/admin/pages/1",
		"/api/v1/admin/settings", "/api/v1/admin/events/1", "/api/v1/admin/practice/1",
	} {
		tags := api.TagsForPath(path)
		if len(tags) == 0 {
			t.Errorf("%s: изменения по этому пути не сбрасывают кеш", path)
		}
		for _, tag := range tags {
			if !known[tag] {
				t.Errorf("%s: тег %q неизвестен фронтенду (lib/api/tags.ts)", path, tag)
			}
		}
	}
}

// TestResponsesMatchSpec: реальные ответы совпадают со схемами из спеки —
// ни лишних полей, ни пропущенных обязательных.
func TestResponsesMatchSpec(t *testing.T) {
	spec := loadSpec(t)
	c := newClient(t).bearer(testAPIToken)

	subj := c.do("POST", "/api/v1/admin/subjects", map[string]any{"name": "Контрактный предмет", "color": "teal", "teacher": "Петров П.П."}, 201)
	subjectID := int64(subj["id"].(float64))
	t.Cleanup(func() { c.do("DELETE", fmt.Sprintf("/api/v1/admin/subjects/%d", subjectID), nil, 200) })

	c.do("POST", "/api/v1/admin/labs", map[string]any{"subjectId": subjectID, "number": 1, "title": "Контрактная лаба",
		"summary": "Проверка схемы", "content": "# Задание", "status": "published"}, 201)
	note := c.do("POST", "/api/v1/admin/notes", map[string]any{"subjectId": subjectID, "number": 1, "title": "Контрактный конспект",
		"summary": "Проверка схемы", "content": "# Текст", "status": "published"}, 201)
	c.do("POST", "/api/v1/admin/quizzes", map[string]any{"subjectId": subjectID, "noteId": int64(note["id"].(float64)),
		"title": "Контрактный квиз", "status": "published", "questions": []map[string]any{
			{"type": "single", "prompt": "Вопрос?", "options": []map[string]any{{"text": "Да", "correct": true}, {"text": "Нет"}}},
		}}, 201)
	c.do("POST", "/api/v1/admin/faq", map[string]any{"question": "Контрактный вопрос?", "answer": "Ответ"}, 201)
	c.do("POST", "/api/v1/admin/pages", map[string]any{"title": "Контрактная страница", "content": "Текст", "status": "published"}, 201)

	lists := []struct{ path, schema string }{
		{"/api/v1/subjects", "SubjectWithCounts"},
		{"/api/v1/labs", "Lab"},
		{"/api/v1/notes", "Note"},
		{"/api/v1/quizzes", "QuizSummary"},
		{"/api/v1/faq", "FAQItem"},
		{"/api/v1/pages", "Page"},
		{"/api/v1/search?q=контрактн", "SearchResult"},
	}
	for _, l := range lists {
		t.Run(l.schema, func(t *testing.T) {
			items := c.list(l.path, 200)
			if len(items) == 0 {
				t.Fatalf("%s: пусто, схему не на чем проверить", l.path)
			}
			assertMatchesSchema(t, spec, l.schema, items[0])
		})
	}

	objects := []struct{ path, schema string }{
		{"/api/v1/settings", "SettingsResponse"},
		{"/api/v1/home", "HomeResponse"},
		{"/api/v1/calendar", "CalendarResponse"},
		{fmt.Sprintf("/api/v1/notes/%s/%s", subj["slug"], note["slug"]), "NoteResponse"},
	}
	for _, o := range objects {
		t.Run(o.schema, func(t *testing.T) {
			assertMatchesSchema(t, spec, o.schema, c.do("GET", o.path, nil, 200))
		})
	}
}
