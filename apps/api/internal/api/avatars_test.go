package api_test

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"image/gif"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/api"
	"github.com/kewldan/edu3105/apps/api/internal/userauth"
)

func tgLogin(c *client, id int64, name, photo string) string {
	c.t.Helper()
	d := userauth.TelegramData{ID: id, FirstName: name, Username: "u" + name, PhotoURL: photo, AuthDate: time.Now().Unix()}
	d.Hash = userauth.SignTelegram(testBotToken, d)
	body := map[string]any{"id": d.ID, "first_name": d.FirstName, "username": d.Username, "auth_date": d.AuthDate, "hash": d.Hash}
	if photo != "" {
		body["photo_url"] = photo
	}
	me := c.do("POST", "/api/v1/auth/telegram", body, 200)
	url, _ := me["user"].(map[string]any)["photoUrl"].(string)
	return url
}

func TestAvatars(t *testing.T) {
	var mu sync.Mutex
	calls := map[string]int{}
	photos := map[string][]byte{}
	prev := api.SetAvatarFetcher(func(_ context.Context, url string) ([]byte, error) {
		mu.Lock()
		defer mu.Unlock()
		calls[url]++
		if b, ok := photos[url]; ok {
			return b, nil
		}
		return nil, errors.New("telegram is down")
	})
	defer api.SetAvatarFetcher(prev)

	anim := &gif.GIF{}
	for i := range 2 {
		fr := image.NewPaletted(image.Rect(0, 0, 32, 32), color.Palette{color.Black, color.White})
		fr.SetColorIndex(i, i, 1)
		anim.Image, anim.Delay = append(anim.Image, fr), append(anim.Delay, 5)
	}
	var gifBuf bytes.Buffer
	_ = gif.EncodeAll(&gifBuf, anim)
	photos["https://t.me/i/userpic/320/a.jpg"] = testJPEGSize(t, 320, 320)
	photos["https://t.me/i/userpic/320/b.gif"] = gifBuf.Bytes()
	photos["https://t.me/i/userpic/320/bad.jpg"] = []byte("<html>not a picture</html>")

	c := newClient(t)
	anon := newClient(t)

	// Фото копируется к нам и отдаётся без входа, с вечным кешем.
	first := tgLogin(c, 9101, "Аня", "https://t.me/i/userpic/320/a.jpg")
	if first == "" || first[:14] != "/api/v1/files/" {
		t.Fatalf("photoUrl = %q, want our own file", first)
	}
	res, body := anon.fetch(first)
	if res.StatusCode != 200 || res.Header.Get("Content-Type") != "image/jpeg" || len(body) == 0 {
		t.Fatalf("avatar: %d %s", res.StatusCode, res.Header.Get("Content-Type"))
	}
	if cc := res.Header.Get("Cache-Control"); cc != "public, max-age=31536000, immutable" {
		t.Fatalf("Cache-Control = %q", cc)
	}
	if bytes.Contains(body, []byte(gpsMarker)) {
		t.Fatal("EXIF survived")
	}
	if res, _ := anon.fetch(first + "?w=160"); res.StatusCode != 200 {
		t.Fatalf("preview: %d", res.StatusCode)
	}

	// Тот же адрес при следующем входе второй раз не качается.
	if again := tgLogin(c, 9101, "Аня", "https://t.me/i/userpic/320/a.jpg"); again != first {
		t.Fatalf("avatar changed without a new photo: %q -> %q", first, again)
	}
	if n := calls["https://t.me/i/userpic/320/a.jpg"]; n != 1 {
		t.Fatalf("downloaded %d times", n)
	}

	// Новая аватарка заменяет старую, анимация становится кадром PNG.
	second := tgLogin(c, 9101, "Аня", "https://t.me/i/userpic/320/b.gif")
	if second == "" || second == first {
		t.Fatalf("photoUrl after change = %q", second)
	}
	if res, _ := anon.fetch(second); res.Header.Get("Content-Type") != "image/png" {
		t.Fatalf("animated avatar served as %s", res.Header.Get("Content-Type"))
	}
	if anon.fetchStatus(first) != http.StatusNotFound {
		t.Fatal("replaced avatar is still served")
	}

	// Недоступный Telegram или не-картинка: вход работает, аватарка прежняя.
	if got := tgLogin(c, 9101, "Аня", "https://t.me/i/userpic/320/gone.jpg"); got != second {
		t.Fatalf("failed download changed the avatar: %q", got)
	}
	if got := tgLogin(c, 9101, "Аня", "https://t.me/i/userpic/320/bad.jpg"); got != second {
		t.Fatalf("garbage replaced the avatar: %q", got)
	}

	// Фото убрали в Telegram: остаются инициалы, файл не отдаётся.
	if got := tgLogin(c, 9101, "Аня", ""); got != "" {
		t.Fatalf("photoUrl without a photo = %q", got)
	}
	if anon.fetchStatus(second) != http.StatusNotFound {
		t.Fatal("removed avatar is still served")
	}

	// Новый аккаунт без фото и аккаунт, чьё фото не скачалось: пустой адрес.
	if got := tgLogin(newClient(t), 9102, "Боря", ""); got != "" {
		t.Fatalf("no photo: %q", got)
	}
	if got := tgLogin(newClient(t), 9103, "Вера", "https://t.me/i/userpic/320/gone.jpg"); got != "" {
		t.Fatalf("failed download: %q", got)
	}
}
