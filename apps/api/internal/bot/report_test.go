package bot

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/models"
)

func TestReportCaption(t *testing.T) {
	sess := models.PracticeSession{ID: 27, SubjectName: "Основы программирования", SubjectShortName: "Прога",
		StartsAt: time.Date(2026, 11, 16, 17, 30, 0, 0, time.UTC), Location: "2133/1"}
	got := reportCaption("https://m3105.ru/", sess, msk)
	for _, want := range []string{"<b>Кто сдаёт: Прога</b>", "16 ноября, 20:30 · ауд. 2133/1",
		`href="https://m3105.ru/practice?session=27"`} {
		if !strings.Contains(got, want) {
			t.Errorf("caption %q lacks %q", got, want)
		}
	}
	if strings.Contains(got, "отменено") {
		t.Error("not canceled session marked canceled")
	}
	sess.Canceled = true
	if got := reportCaption("https://m3105.ru", sess, msk); !strings.Contains(got, "Занятие отменено") {
		t.Errorf("canceled caption %q", got)
	}
}

func TestReportsRender(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer secret" {
			http.Error(w, "Неверный токен", http.StatusUnauthorized)
			return
		}
		if r.URL.Path != "/api/practice-report" || r.URL.Query().Get("id") != "27" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write([]byte("PNG"))
	}))
	defer srv.Close()

	png, err := NewReports(srv.URL+"/", "secret").Render(context.Background(), 27)
	if err != nil || string(png) != "PNG" {
		t.Fatalf("render = %q, %v", png, err)
	}
	if _, err := NewReports(srv.URL, "wrong").Render(context.Background(), 27); err == nil || !strings.Contains(err.Error(), "401") {
		t.Errorf("wrong token: %v", err)
	}
	if _, err := NewReports(srv.URL, "secret").Render(context.Background(), 1); err == nil {
		t.Error("missing session rendered")
	}
	if NewReports("", "secret") != nil {
		t.Error("reports without web URL")
	}
}

func TestSendAndEditPhoto(t *testing.T) {
	var calls []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		method := r.URL.Path[strings.LastIndex(r.URL.Path, "/")+1:]
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Errorf("%s: %v", method, err)
		}
		field := "photo"
		if method == "editMessageMedia" {
			field = "report"
			var media map[string]string
			if err := json.Unmarshal([]byte(r.FormValue("media")), &media); err != nil || media["media"] != "attach://report" || media["caption"] != "<b>c</b>" {
				t.Errorf("media = %q", r.FormValue("media"))
			}
			if r.FormValue("message_id") != "7" {
				t.Errorf("message_id = %q", r.FormValue("message_id"))
			}
		} else if r.FormValue("caption") != "<b>c</b>" || r.FormValue("parse_mode") != "HTML" {
			t.Errorf("caption = %q", r.FormValue("caption"))
		}
		f, _, err := r.FormFile(field)
		if err != nil {
			t.Fatalf("%s: no file %s: %v", method, field, err)
		}
		data, _ := io.ReadAll(f)
		if string(data) != "PNG" || r.FormValue("chat_id") != "42" || !strings.Contains(r.FormValue("reply_markup"), "report:27") {
			t.Errorf("%s: file %q chat %q markup %q", method, data, r.FormValue("chat_id"), r.FormValue("reply_markup"))
		}
		calls = append(calls, method)
		_, _ = w.Write([]byte(`{"ok":true,"result":{}}`))
	}))
	defer srv.Close()

	c := &Client{base: srv.URL + "/bot/", hc: srv.Client()}
	ctx := context.Background()
	if err := c.SendPhoto(ctx, 42, []byte("PNG"), "<b>c</b>", reportKeyboard(27)); err != nil {
		t.Fatal(err)
	}
	if err := c.EditPhoto(ctx, 42, 7, []byte("PNG"), "<b>c</b>", reportKeyboard(27)); err != nil {
		t.Fatal(err)
	}
	if strings.Join(calls, ",") != "sendPhoto,editMessageMedia" {
		t.Errorf("calls = %v", calls)
	}
}
