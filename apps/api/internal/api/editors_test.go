package api_test

import (
	"fmt"
	"testing"
)

// claimAs signs a dev student in and picks the named row of the course list.
func claimAs(t *testing.T, devName, fullName string) *client {
	t.Helper()
	c := newClient(t)
	c.do("POST", "/api/v1/auth/dev-login", map[string]string{"name": devName}, 200)
	for _, s := range c.list("/api/v1/me/students", 200) {
		if s["fullName"] == fullName {
			c.do("POST", "/api/v1/me/claim", map[string]any{"studentId": s["id"]}, 200)
			return c
		}
	}
	t.Fatalf("%s is not in the list", fullName)
	return nil
}

// Ответственные: правят только материалы своей зоны, всё попадает в журнал, админ откатывает.
func TestEditors(t *testing.T) {
	admin := newClient(t).bearer(testAPIToken)
	admin.do("POST", "/api/v1/admin/students/import", map[string]string{"text": "ИСУ\tФИО\tПоток\tГруппа\n" +
		"970001\tАлисова Алиса Петровна\t7\tM3171\n970002\tБобов Боб Иванович\t7\tM3172\n970003\tКарлов Карл Карлович\t6\tM3161\n"}, 200)
	alice := claimAs(t, "Алиса Редакторова", "Алисова Алиса Петровна")
	bob := claimAs(t, "Боб Редакторов", "Бобов Боб Иванович")
	claimAs(t, "Карл Чужой", "Карлов Карл Карлович")
	aliceID := userIDByName(t, admin, "Алиса Алисова")
	bobID := userIDByName(t, admin, "Боб Бобов")
	carlID := userIDByName(t, admin, "Карл Карлов")

	alice.do("GET", "/api/v1/admin/labs", nil, 401)
	alice.do("GET", "/api/v1/auth/me", nil, 401)
	role := admin.do("POST", "/api/v1/admin/editors", map[string]any{"userId": aliceID, "scope": "stream:7"}, 201)
	admin.do("POST", "/api/v1/admin/editors", map[string]any{"userId": aliceID, "scope": "stream:7"}, 422)
	if role["userName"] != "Алиса Алисова" || role["grantedBy"] != nil {
		t.Fatalf("role: %v", role)
	}
	me := alice.do("GET", "/api/v1/auth/me", nil, 200)
	zone := fmt.Sprint(me["editor"].(map[string]any)["zone"])
	if me["role"] != "editor" || zone != "[group:М3171 group:М3172 stream:7]" {
		t.Fatalf("editor me: %v", me)
	}
	alice.do("GET", "/api/v1/admin/settings", nil, 403)
	alice.do("GET", "/api/v1/admin/users", nil, 403)
	alice.do("POST", "/api/v1/admin/subjects", map[string]any{"name": "Свой предмет", "color": "blue"}, 403)

	subj := admin.do("POST", "/api/v1/admin/subjects", map[string]any{"name": "Предмет ответственных", "color": "teal"}, 201)
	subjectID := int64(subj["id"].(float64))
	t.Cleanup(func() { admin.do("DELETE", fmt.Sprintf("/api/v1/admin/subjects/%d", subjectID), nil, 200) })
	if got := alice.list("/api/v1/admin/subjects", 200); len(got) == 0 {
		t.Fatal("editor must see subjects to pick one")
	}

	lab := func(c *client, title string, audience []string, want int) map[string]any {
		return c.do("POST", "/api/v1/admin/labs", map[string]any{"subjectId": subjectID, "number": 1, "title": title,
			"status": "published", "audience": audience}, want)
	}
	if e := lab(alice, "Для всех", nil, 403); e["code"] != "outside_zone" {
		t.Fatalf("for everyone: %v", e)
	}
	lab(alice, "Чужой поток", []string{"stream:6"}, 403)
	own := lab(alice, "Своя", []string{"stream:7"}, 201)
	ownID := int64(own["id"].(float64))
	if own["authorName"] != "Алиса Алисова" || own["authorId"] != float64(aliceID) {
		t.Fatalf("author: %v", own)
	}
	public := lab(admin, "Общая", nil, 201)
	publicID := int64(public["id"].(float64))
	alice.do("PUT", fmt.Sprintf("/api/v1/admin/labs/%d", publicID), map[string]any{"subjectId": subjectID, "number": 1, "title": "Захват",
		"audience": []string{"stream:7"}}, 403)
	alice.do("DELETE", fmt.Sprintf("/api/v1/admin/labs/%d", publicID), nil, 403)
	if got := alice.list(fmt.Sprintf("/api/v1/admin/labs?subjectId=%d", subjectID), 200); len(got) != 1 || got[0]["title"] != "Своя" {
		t.Fatalf("editor list: %v", got)
	}
	alice.do("PUT", fmt.Sprintf("/api/v1/admin/labs/%d", ownID), map[string]any{"subjectId": subjectID, "number": 1, "title": "Своя, исправленная",
		"status": "published", "audience": []string{"stream:7"}, "authorId": carlID}, 200)
	if got := admin.do("GET", fmt.Sprintf("/api/v1/admin/labs/%d", ownID), nil, 200); got["authorId"] != float64(aliceID) {
		t.Fatalf("editor must not change the author: %v", got)
	}

	// Ответственный за поток назначает ответственных за группы своего потока, и только их.
	alice.do("POST", "/api/v1/admin/editors", map[string]any{"userId": carlID, "scope": "group:М3161"}, 403)
	alice.do("POST", "/api/v1/admin/editors", map[string]any{"userId": bobID, "scope": "stream:7"}, 403)
	bobRole := alice.do("POST", "/api/v1/admin/editors", map[string]any{"userId": bobID, "scope": "group:m3172"}, 201)
	if bobRole["scope"] != "group:М3172" || bobRole["grantedBy"] != "Алиса Алисова" {
		t.Fatalf("group role: %v", bobRole)
	}
	if got := alice.list("/api/v1/admin/editors/candidates", 200); len(got) != 2 {
		t.Fatalf("candidates of stream 7: %v", got)
	}
	lab(bob, "Весь поток", []string{"stream:7"}, 403)
	lab(bob, "Своя группа", []string{"group:М3172"}, 201)
	bob.do("POST", "/api/v1/admin/editors", map[string]any{"userId": aliceID, "scope": "group:М3172"}, 403)
	if got := bob.list("/api/v1/admin/editors", 200); len(got) != 1 {
		t.Fatalf("group editor sees roles: %v", got)
	}

	// Квиз следует своему конспекту.
	note := alice.do("POST", "/api/v1/admin/notes", map[string]any{"subjectId": subjectID, "number": 1, "title": "Лекция потока",
		"status": "published", "audience": []string{"stream:7"}}, 201)
	quiz := map[string]any{"title": "Квиз потока", "status": "published", "noteId": note["id"],
		"questions": []map[string]any{{"type": "single", "prompt": "2+2?", "options": []map[string]any{{"text": "4", "correct": true}, {"text": "5"}}}}}
	alice.do("POST", "/api/v1/admin/quizzes", quiz, 201)
	shared := admin.do("POST", "/api/v1/admin/notes", map[string]any{"subjectId": subjectID, "number": 2, "title": "Общая лекция", "status": "published"}, 201)
	quiz["noteId"] = shared["id"]
	alice.do("POST", "/api/v1/admin/quizzes", quiz, 403)

	// Журнал и откат.
	journal := admin.list("/api/v1/admin/journal?entity=labs", 200)
	var update, create map[string]any
	for _, e := range journal {
		if e["entityId"] == float64(ownID) && e["action"] == "update" {
			update = e
		}
		if e["entityId"] == float64(ownID) && e["action"] == "create" {
			create = e
		}
	}
	if update == nil || create == nil || update["actorName"] != "Алиса Алисова" {
		t.Fatalf("journal: %v", journal)
	}
	if got := alice.list("/api/v1/admin/journal", 200); len(got) == 0 || len(got) >= len(admin.list("/api/v1/admin/journal", 200)) {
		t.Fatal("editor must see only the journal of their zone")
	}
	alice.do("POST", fmt.Sprintf("/api/v1/admin/journal/%v/revert", update["id"]), nil, 403)
	admin.do("POST", fmt.Sprintf("/api/v1/admin/journal/%v/revert", update["id"]), nil, 200)
	admin.do("POST", fmt.Sprintf("/api/v1/admin/journal/%v/revert", update["id"]), nil, 409)
	if got := admin.do("GET", fmt.Sprintf("/api/v1/admin/labs/%d", ownID), nil, 200); got["title"] != "Своя" || got["authorId"] != float64(aliceID) {
		t.Fatalf("revert update: %v", got)
	}
	admin.do("POST", fmt.Sprintf("/api/v1/admin/journal/%v/revert", create["id"]), nil, 200)
	admin.do("GET", fmt.Sprintf("/api/v1/admin/labs/%d", ownID), nil, 404)

	// Снятая роль закрывает админку.
	alice.do("DELETE", fmt.Sprintf("/api/v1/admin/editors/%v", bobRole["id"]), nil, 200)
	bob.do("GET", "/api/v1/admin/labs", nil, 401)
	alice.do("DELETE", fmt.Sprintf("/api/v1/admin/editors/%v", role["id"]), nil, 403)
	admin.do("DELETE", fmt.Sprintf("/api/v1/admin/editors/%v", role["id"]), nil, 200)
	alice.do("GET", "/api/v1/admin/labs", nil, 401)
}
