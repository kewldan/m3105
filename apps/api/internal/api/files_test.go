package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"io/fs"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/api"
	"github.com/kewldan/edu3105/apps/api/internal/files"
	"github.com/kewldan/edu3105/apps/api/internal/store"
)

const gpsMarker = "GPSLatitude=59.957N"

func testJPEG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 16, 9))
	img.Set(1, 1, color.RGBA{255, 0, 0, 255})
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatal(err)
	}
	raw := buf.Bytes()
	// APP1 EXIF без ориентации, зато с «координатами», которые должны исчезнуть.
	payload := append([]byte("Exif\x00\x00MM\x00\x2a\x00\x00\x00\x08\x00\x00"), gpsMarker...)
	seg := []byte{0xFF, 0xE1, byte((len(payload) + 2) >> 8), byte(len(payload) + 2)}
	out := append(append(append([]byte(nil), raw[:2]...), seg...), payload...)
	return append(out, raw[2:]...)
}

func testPNG(t *testing.T, shade uint8) []byte {
	t.Helper()
	img := image.NewGray(image.Rect(0, 0, 4, 4))
	img.SetGray(0, 0, color.Gray{Y: shade})
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// upload sends a multipart file like the site does.
func (c *client) upload(path, name string, data []byte, want int) map[string]any {
	c.t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	fw, _ := mw.CreateFormFile("file", name)
	_, _ = fw.Write(data)
	_ = mw.Close()
	req, _ := http.NewRequest("POST", srvURL+path, &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if c.authz != "" {
		req.Header.Set("Authorization", c.authz)
	}
	res, err := c.hc.Do(req)
	if err != nil {
		c.t.Fatalf("upload %s: %v", name, err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode != want {
		c.t.Fatalf("upload %s: status %d, want %d: %s", name, res.StatusCode, want, raw)
	}
	out := map[string]any{}
	_ = json.Unmarshal(raw, &out)
	return out
}

// fetch downloads a file URL and returns the response with its body.
func (c *client) fetch(url string) (*http.Response, []byte) {
	c.t.Helper()
	return c.fetchWith(url, nil)
}

func (c *client) fetchStatus(url string) int {
	c.t.Helper()
	res, _ := c.fetch(url)
	return res.StatusCode
}

func student(t *testing.T, admin *client, name string) *client {
	t.Helper()
	c := newClient(t)
	c.do("POST", "/api/v1/auth/dev-login", map[string]string{"name": name}, 200)
	admin.do("PUT", fmt.Sprintf("/api/v1/admin/users/%d", userIDByName(t, admin, name)), map[string]any{"approved": true}, 200)
	return c
}

func attachmentsOf(t *testing.T, obj map[string]any) []map[string]any {
	t.Helper()
	raw, ok := obj["attachments"].([]any)
	if !ok {
		t.Fatalf("no attachments array in %v", obj)
	}
	out := make([]map[string]any, len(raw))
	for i, a := range raw {
		out[i] = a.(map[string]any)
	}
	return out
}

func objectExists(t *testing.T, id string) bool {
	t.Helper()
	_, err := os.Stat(filepath.Join(testFileDir, id))
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		t.Fatal(err)
	}
	return err == nil
}

func TestAttachments(t *testing.T) {
	spec := loadSpec(t)
	admin := newClient(t).bearer(testAPIToken)
	subj := admin.do("POST", "/api/v1/admin/subjects", map[string]any{"name": "Вложения", "color": "blue"}, 201)
	lab := admin.do("POST", "/api/v1/admin/labs", map[string]any{"subjectId": subj["id"], "number": 1, "title": "Файлы", "status": "published"}, 201)
	labID := int64(lab["id"].(float64))

	anon := newClient(t)
	anon.upload("/api/v1/files", "a.png", testPNG(t, 1), 401)
	pending := newClient(t)
	pending.do("POST", "/api/v1/auth/dev-login", map[string]string{"name": "Неподтверждённый"}, 200)
	pending.upload("/api/v1/files", "a.png", testPNG(t, 1), 403)
	masha := student(t, admin, "Маша Файлова")
	petya := student(t, admin, "Петя Файлов")

	// Фото с телефона: EXIF с координатами вырезается, пока файл не прикреплён — видит только автор.
	photo := masha.upload("/api/v1/files", "IMG_0001.JPG", testJPEG(t), 201)
	assertMatchesSchema(t, spec, "Attachment", photo)
	photoID, photoURL := photo["id"].(string), photo["url"].(string)
	if photoURL != "/api/v1/files/"+photoID+"/img-0001.jpg" || photo["width"] != 16.0 || photo["contentType"] != "image/jpeg" {
		t.Fatalf("unexpected upload: %v", photo)
	}
	if anon.fetchStatus(photoURL) != 404 || petya.fetchStatus(photoURL) != 404 {
		t.Fatal("a pending upload must be visible to its author only")
	}
	if _, body := masha.fetch(photoURL); len(body) == 0 || bytes.Contains(body, []byte(gpsMarker)) {
		t.Fatal("author must get the file without GPS metadata")
	}
	masha.upload("/api/v1/files", "page.html", []byte("<html><script>alert(1)</script></html>"), 422)
	masha.upload("/api/v1/files", "huge.pdf", append([]byte("%PDF-1.7\n"), make([]byte, files.StudentPolicy.MaxSize)...), 413)

	// Фото без подписи — нормальный комментарий; после публикации файл виден всем.
	cm := masha.do("POST", fmt.Sprintf("/api/v1/comments/lab/%d", labID), map[string]any{"body": "", "attachmentIds": []string{photoID}}, 201)
	assertMatchesSchema(t, spec, "Comment", cm)
	if got := attachmentsOf(t, cm); len(got) != 1 || got[0]["url"] != photoURL {
		t.Fatalf("comment attachments: %v", got)
	}
	res, _ := anon.fetch(photoURL)
	if res.StatusCode != 200 || !strings.HasPrefix(res.Header.Get("Content-Disposition"), "inline") ||
		!strings.Contains(res.Header.Get("Content-Security-Policy"), "sandbox") ||
		!strings.Contains(res.Header.Get("Cache-Control"), "immutable") || res.Header.Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("public photo: %d %v", res.StatusCode, res.Header)
	}
	if res, _ := anon.fetch(photoURL + "?download=1"); !strings.HasPrefix(res.Header.Get("Content-Disposition"), "attachment") {
		t.Fatalf("download must be an attachment: %v", res.Header)
	}
	masha.do("POST", "/api/v1/comments/lab/"+fmt.Sprint(labID), map[string]any{"body": "ещё раз", "attachmentIds": []string{photoID}}, 422)
	masha.do("POST", "/api/v1/comments/lab/"+fmt.Sprint(labID), map[string]any{"body": "x", "attachmentIds": []string{"../../etc"}}, 422)
	petyaPic := petya.upload("/api/v1/files", "screen.png", testPNG(t, 2), 201)
	masha.do("POST", "/api/v1/comments/lab/"+fmt.Sprint(labID), map[string]any{"body": "чужое", "attachmentIds": []any{petyaPic["id"]}}, 422)
	if cl := anon.list(fmt.Sprintf("/api/v1/comments/lab/%d", labID), 200); len(attachmentsOf(t, cl[0])) != 1 {
		t.Fatalf("comment list lost attachments: %v", cl)
	}
	masha.do("DELETE", fmt.Sprintf("/api/v1/comments/%v", cm["id"]), nil, 200)
	if anon.fetchStatus(photoURL) != 404 {
		t.Fatal("the photo of a deleted comment is still served")
	}

	// Пост «для своих» с файлом: аноним файла не видит; правка без списка файлы
	// не трогает, пустой список убирает все.
	picID, picURL := petyaPic["id"].(string), petyaPic["url"].(string)
	post := petya.do("POST", "/api/v1/posts", map[string]any{"kind": "joke", "body": "С картинкой", "visibility": "members", "attachmentIds": []string{picID}}, 201)
	assertMatchesSchema(t, spec, "Post", post)
	postPath := fmt.Sprintf("/api/v1/posts/%v", post["id"])
	if anon.fetchStatus(picURL) != 404 || masha.fetchStatus(picURL) != 200 {
		t.Fatal("members-only post files must be hidden from anonymous visitors only")
	}
	if res, _ := masha.fetch(picURL); !strings.HasPrefix(res.Header.Get("Cache-Control"), "private") {
		t.Fatalf("members-only file must not be publicly cacheable: %v", res.Header)
	}
	kept := petya.do("PUT", postPath, map[string]any{"body": "Текст поправлен", "visibility": "members"}, 200)
	if len(attachmentsOf(t, kept)) != 1 {
		t.Fatalf("update without attachmentIds must keep files: %v", kept)
	}
	second := petya.upload("/api/v1/files", "second.png", testPNG(t, 3), 201)
	both := petya.do("PUT", postPath, map[string]any{"body": "Две", "visibility": "members", "attachmentIds": []any{second["id"], picID}}, 200)
	if got := attachmentsOf(t, both); len(got) != 2 || got[0]["id"] != second["id"] {
		t.Fatalf("files must follow the given order: %v", got)
	}
	cleared := petya.do("PUT", postPath, map[string]any{"body": "Без файлов", "attachmentIds": []string{}}, 200)
	if len(attachmentsOf(t, cleared)) != 0 || masha.fetchStatus(picURL) != 404 {
		t.Fatalf("empty attachmentIds must remove files: %v", cleared)
	}

	// Админка: любые типы, повторная загрузка отдаёт тот же файл, ссылки из
	// текстов видны в списке, удаление сразу ломает ссылку.
	pdf := []byte("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF")
	doc := admin.upload("/api/v1/admin/files", "Методичка.pdf", pdf, 201)
	if again := admin.upload("/api/v1/admin/files", "copy.pdf", pdf, 200); again["id"] != doc["id"] {
		t.Fatalf("re-upload must reuse the file: %v", again)
	}
	zip := admin.upload("/api/v1/admin/files", "code.zip", append([]byte("PK\x03\x04"), make([]byte, 40)...), 201)
	if res, _ := anon.fetch(zip["url"].(string)); res.StatusCode != 200 || !strings.HasPrefix(res.Header.Get("Content-Disposition"), "attachment") {
		t.Fatalf("archives must download, not open: %d %v", res.StatusCode, res.Header)
	}
	if res, body := anon.fetch(doc["url"].(string)); res.Header.Get("Content-Type") != "application/pdf" || !bytes.Equal(body, pdf) ||
		!strings.Contains(res.Header.Get("Content-Disposition"), "filename*=utf-8''%D0%9C") {
		t.Fatalf("pdf served wrong: %v", res.Header)
	}
	admin.do("POST", "/api/v1/admin/notes", map[string]any{"subjectId": subj["id"], "number": 1, "title": "Со ссылкой",
		"content": "[Методичка](" + doc["url"].(string) + ")", "status": "published"}, 201)
	var listed map[string]any
	for _, f := range admin.list("/api/v1/admin/files", 200) {
		if f["id"] == doc["id"] {
			listed = f
		}
		if f["id"] == second["id"] {
			t.Fatal("a file removed from its post must disappear from the list")
		}
	}
	if listed == nil || listed["place"] != "content" {
		t.Fatalf("admin file missing or misplaced: %v", listed)
	}
	if used := listed["usedIn"].([]any); len(used) != 1 || used[0].(map[string]any)["type"] != "note" {
		t.Fatalf("usage in notes not found: %v", listed["usedIn"])
	}
	admin.do("DELETE", fmt.Sprintf("/api/v1/admin/files/%v", doc["id"]), nil, 200)
	if anon.fetchStatus(doc["url"].(string)) != 404 || objectExists(t, doc["id"].(string)) {
		t.Fatal("deleted admin file is still there")
	}

	prev := api.SetUploadLimit(0)
	masha.upload("/api/v1/files", "one-more.png", testPNG(t, 4), 429)
	api.SetUploadLimit(prev)

	// Сборщик мусора: брошенная загрузка старше суток уходит вместе с объектом,
	// объекты без строки (удалённый комментарий) — тоже.
	stale := masha.upload("/api/v1/files", "stale.png", testPNG(t, 5), 201)
	staleID := stale["id"].(string)
	ctx := context.Background()
	if _, err := testPool.Exec(ctx, `UPDATE attachments SET created_at = now() - interval '2 days' WHERE id = $1`, staleID); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-2 * time.Hour)
	for _, id := range []string{staleID, photoID} {
		if err := os.Chtimes(filepath.Join(testFileDir, id), old, old); err != nil {
			t.Fatal(err)
		}
	}
	if err := files.Collect(ctx, store.New(testPool), testFiles); err != nil {
		t.Fatal(err)
	}
	if objectExists(t, staleID) || objectExists(t, photoID) {
		t.Fatal("GC left orphaned objects")
	}
	if !objectExists(t, zip["id"].(string)) {
		t.Fatal("GC deleted a live file")
	}
}

func testWidePNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewGray(image.Rect(0, 0, w, h))
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func (c *client) fetchWith(url string, headers map[string]string) (*http.Response, []byte) {
	c.t.Helper()
	req, _ := http.NewRequest("GET", srvURL+url, nil)
	if c.authz != "" {
		req.Header.Set("Authorization", c.authz)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	res, err := c.hc.Do(req)
	if err != nil {
		c.t.Fatalf("GET %s: %v", url, err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	return res, raw
}

// Превью: ?w= из списка отдаёт копию от imgproxy (фейкового в тестах), всё
// остальное — оригинал; права проверяются до imgproxy.
func TestPreviews(t *testing.T) {
	admin := newClient(t).bearer(testAPIToken)
	anon := newClient(t)
	orig := testWidePNG(t, 400, 100)
	pic := admin.upload("/api/v1/admin/files", "wide.png", orig, 201)
	url, id := pic["url"].(string), pic["id"].(string)
	webp := map[string]string{"Accept": "image/avif,image/webp,*/*"}

	res, body := anon.fetchWith(url+"?w=160", webp)
	if res.StatusCode != 200 || res.Header.Get("Content-Type") != "image/webp" || res.Header.Get("Vary") != "Accept" ||
		string(body) != "preview:rs:fit:160:0/q:80/plain/local:///"+id+"@webp" {
		t.Fatalf("preview: %d %v %q", res.StatusCode, res.Header, body)
	}
	if !strings.Contains(res.Header.Get("Content-Disposition"), "wide.webp") || !strings.Contains(res.Header.Get("Cache-Control"), "immutable") {
		t.Fatalf("preview headers: %v", res.Header)
	}
	etag := res.Header.Get("ETag")
	if res, _ := anon.fetchWith(url+"?w=160", map[string]string{"Accept": "image/webp", "If-None-Match": etag}); res.StatusCode != 304 {
		t.Fatalf("If-None-Match: %d", res.StatusCode)
	}
	if res, body := anon.fetchWith(url+"?w=320", nil); res.Header.Get("Content-Type") != "image/png" || !strings.HasSuffix(string(body), "@png") {
		t.Fatalf("no webp in Accept must keep png: %v %q", res.Header, body)
	}
	for _, q := range []string{"?w=640", "?w=333", "?w=160&download=1", ""} {
		if _, body := anon.fetchWith(url+q, webp); !bytes.Equal(body, orig) {
			t.Fatalf("%s must serve the original", q)
		}
	}
	imgproxyDown.Store(true)
	if res, body := anon.fetchWith(url+"?w=160", webp); res.StatusCode != 200 || !bytes.Equal(body, orig) {
		t.Fatalf("imgproxy down must fall back to the original: %d", res.StatusCode)
	}
	imgproxyDown.Store(false)

	// Скрытый файл не отдаётся и превью: права проверяются раньше imgproxy.
	s := student(t, admin, "Превью Студент")
	hidden := s.upload("/api/v1/files", "wide.png", orig, 201)
	if anon.fetchStatus(hidden["url"].(string)+"?w=160") != 404 {
		t.Fatal("preview leaked a pending upload")
	}
}

// Админ может всё: видит любые файлы, добавляет свои файлы в чужие посты и
// комментарии, правит текст комментария.
func TestAdminCanDoEverything(t *testing.T) {
	admin := newClient(t).bearer(testAPIToken)
	anon := newClient(t)
	s := student(t, admin, "Модерируемый Студент")
	subj := admin.do("POST", "/api/v1/admin/subjects", map[string]any{"name": "Модерация", "color": "rose"}, 201)
	lab := admin.do("POST", "/api/v1/admin/labs", map[string]any{"subjectId": subj["id"], "number": 1, "title": "Модерация", "status": "published"}, 201)

	pending := s.upload("/api/v1/files", "mine.png", testPNG(t, 10), 201)
	if admin.fetchStatus(pending["url"].(string)) != 200 || anon.fetchStatus(pending["url"].(string)) != 404 {
		t.Fatal("admin must see pending uploads, anonymous must not")
	}
	post := s.do("POST", "/api/v1/posts", map[string]any{"kind": "joke", "body": "Пост", "visibility": "members", "attachmentIds": []any{pending["id"]}}, 201)
	postURL := fmt.Sprintf("/api/v1/admin/posts/%v", post["id"])

	// Файл админки для текстов в пост не прикрепить, файл «для постов» — можно.
	content := admin.upload("/api/v1/admin/files", "for-notes.png", testPNG(t, 11), 201)
	admin.do("PUT", postURL, map[string]any{"body": "Пост", "attachmentIds": []any{pending["id"], content["id"]}}, 422)
	extra := admin.upload("/api/v1/admin/files?scope=social", "admin.pdf", []byte("%PDF-1.7\n%%EOF"), 201)
	if again := admin.upload("/api/v1/admin/files?scope=social", "admin.pdf", []byte("%PDF-1.7\n%%EOF"), 201); again["id"] == extra["id"] {
		t.Fatal("files for posts must not be shared between uploads")
	}
	s.do("PUT", fmt.Sprintf("/api/v1/posts/%v", post["id"]), map[string]any{"body": "Пост", "attachmentIds": []any{pending["id"], extra["id"]}}, 422)
	edited := admin.do("PUT", postURL, map[string]any{"body": "Поправил админ", "visibility": "members", "attachmentIds": []any{extra["id"], pending["id"]}}, 200)
	if got := attachmentsOf(t, edited); len(got) != 2 || got[0]["id"] != extra["id"] || edited["body"] != "Поправил админ" {
		t.Fatalf("admin post edit: %v", edited)
	}
	if admin.fetchStatus(extra["url"].(string)) != 200 || anon.fetchStatus(extra["url"].(string)) != 404 {
		t.Fatal("files of a members-only post: admin yes, anonymous no")
	}

	// Комментарий: текст и файлы правит админ, студенту такой маршрут недоступен.
	cm := s.do("POST", fmt.Sprintf("/api/v1/comments/lab/%v", lab["id"]), map[string]any{"body": "Опечатка тут"}, 201)
	cmURL := fmt.Sprintf("/api/v1/admin/comments/%v", cm["id"])
	s.do("PUT", cmURL, map[string]any{"body": "x"}, 401)
	shot := admin.upload("/api/v1/admin/files?scope=social", "shot.png", testPNG(t, 12), 201)
	fixed := admin.do("PUT", cmURL, map[string]any{"body": "Опечатки нет", "attachmentIds": []any{shot["id"]}}, 200)
	if fixed["body"] != "Опечатки нет" || len(attachmentsOf(t, fixed)) != 1 || fixed["updatedAt"] == cm["updatedAt"] {
		t.Fatalf("admin comment edit: %v", fixed)
	}
	if anon.fetchStatus(shot["url"].(string)) != 200 {
		t.Fatal("file on a public comment must be public")
	}
	kept := admin.do("PUT", cmURL, map[string]any{"body": "Только текст"}, 200)
	if len(attachmentsOf(t, kept)) != 1 {
		t.Fatal("edit without attachmentIds must keep files")
	}
	admin.do("PUT", cmURL, map[string]any{"body": "", "attachmentIds": []any{}}, 422)
	cleared := admin.do("PUT", cmURL, map[string]any{"body": "Без файла", "attachmentIds": []any{}}, 200)
	if len(attachmentsOf(t, cleared)) != 0 || anon.fetchStatus(shot["url"].(string)) != 404 {
		t.Fatalf("empty list must drop files: %v", cleared)
	}
	admin.do("PUT", "/api/v1/admin/comments/999999", map[string]any{"body": "x"}, 404)

	// Брошенная загрузка админа «для постов» тоже уходит через сутки, файлы для текстов — никогда.
	stale := admin.upload("/api/v1/admin/files?scope=social", "stale.png", testPNG(t, 13), 201)
	ctx := context.Background()
	if _, err := testPool.Exec(ctx, `UPDATE attachments SET created_at = now() - interval '2 days' WHERE id = ANY($1)`,
		[]string{stale["id"].(string), content["id"].(string)}); err != nil {
		t.Fatal(err)
	}
	if err := files.Collect(ctx, store.New(testPool), testFiles); err != nil {
		t.Fatal(err)
	}
	if admin.fetchStatus(stale["url"].(string)) != 404 || admin.fetchStatus(content["url"].(string)) != 200 {
		t.Fatal("GC must drop stale admin post uploads and keep files for texts")
	}
}
