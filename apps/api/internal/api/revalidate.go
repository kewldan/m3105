package api

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5/middleware"
)

// tagsForPath maps an admin route to the cache tags its changes invalidate.
// Держать в синхроне с `TAG` в `apps/web/lib/api/tags.ts`.
func tagsForPath(path string) []string {
	_, rest, ok := strings.Cut(path, "/admin/")
	if !ok {
		return nil
	}
	entity, _, _ := strings.Cut(rest, "/")
	switch entity {
	case "subjects":
		// Название предмета видно в лабах, конспектах и квизах.
		return []string{"subjects", "labs", "notes", "quizzes", "calendar", "home"}
	case "labs":
		return []string{"labs", "calendar", "home"}
	case "notes":
		return []string{"notes", "home"}
	case "quizzes":
		return []string{"quizzes", "notes", "home"}
	case "faq":
		return []string{"faq"}
	case "pages":
		// Страницы попадают в навигацию, а она приезжает вместе с настройками.
		return []string{"pages", "settings"}
	case "settings":
		return []string{"settings", "home"}
	case "events":
		return []string{"calendar", "home"}
	case "practice":
		return []string{"practice", "calendar", "home"}
	}
	// Пользователи, комментарии и посты в кеш не попадают: они личные или пишутся часто.
	return nil
}

// revalidateCache drops the frontend's cached API responses after a successful
// admin change, чтобы правка появлялась на сайте сразу, а не по таймеру.
func (h *Handler) revalidateCache(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if h.revalidator == nil || r.Method == http.MethodGet || r.Method == http.MethodHead {
			next.ServeHTTP(w, r)
			return
		}
		tags := tagsForPath(r.URL.Path)
		if len(tags) == 0 {
			next.ServeHTTP(w, r)
			return
		}
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
		if ww.Status() >= 200 && ww.Status() < 300 {
			h.revalidator.Tags(tags...)
		}
	})
}
