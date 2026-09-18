package api

import (
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/kewldan/edu3105/apps/api/internal/files"
	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/store"
	"github.com/kewldan/edu3105/apps/api/internal/userauth"
)

// Вложения. Загрузка — multipart с полем file: студент кладёт картинки и PDF,
// потом передаёт id в attachmentIds комментария или поста; админ кладёт что
// угодно — для текстов (ссылка в MDX) или, с ?scope=social, для любого
// комментария или поста. Отдаёт файлы сам API, а не бакет: так работают права
// (посты «для своих», чужие незаконченные загрузки), а хранилище не торчит
// наружу. Превью картинок (?w=) API берёт у imgproxy уже после проверки прав.

const adminFilesLimit = 500

// Anti-spam for uploads, separate from the comment limit: a student may attach
// photos to every comment they are allowed to write.
var (
	uploadLimit  = 30
	uploadWindow = 12 * time.Hour
)

func (h *Handler) filesReady(w http.ResponseWriter) bool {
	if h.files == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "files_disabled", "Загрузка файлов не настроена на сервере")
		return false
	}
	return true
}

// readUpload returns the "file" part of a multipart body. It writes the error
// response itself.
func readUpload(w http.ResponseWriter, r *http.Request, maxSize int64) (string, []byte, bool) {
	// Медленная мобильная сеть: даём время дочитать тело (nginx в проде и так буферизует).
	_ = http.NewResponseController(w).SetReadDeadline(time.Now().Add(10 * time.Minute))
	tooLarge := func() {
		httpx.Error(w, http.StatusRequestEntityTooLarge, "too_large", fmt.Sprintf("Файл больше %d МБ", maxSize>>20))
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxSize+1<<20) // запас на заголовки multipart
	mr, err := r.MultipartReader()
	if err != nil {
		httpx.Fail(w, &httpx.ValidationError{Fields: map[string]string{"file": "Ожидается multipart/form-data с полем file"}})
		return "", nil, false
	}
	for {
		part, err := mr.NextPart()
		var tooBig *http.MaxBytesError
		switch {
		case errors.As(err, &tooBig):
			tooLarge()
			return "", nil, false
		case errors.Is(err, io.EOF):
			httpx.Fail(w, &httpx.ValidationError{Fields: map[string]string{"file": "Выберите файл"}})
			return "", nil, false
		case err != nil:
			httpx.Fail(w, &httpx.ValidationError{Fields: map[string]string{"file": "Не удалось прочитать файл"}})
			return "", nil, false
		}
		if part.FormName() != "file" {
			_ = part.Close()
			continue
		}
		data, err := io.ReadAll(io.LimitReader(part, maxSize+1))
		_ = part.Close()
		if errors.As(err, &tooBig) || int64(len(data)) > maxSize {
			tooLarge()
			return "", nil, false
		}
		if err != nil {
			httpx.Fail(w, &httpx.ValidationError{Fields: map[string]string{"file": "Загрузка оборвалась, попробуйте ещё раз"}})
			return "", nil, false
		}
		return part.FileName(), data, true
	}
}

// storeUpload checks, stores and records one file. userID is nil for admins.
func (h *Handler) storeUpload(w http.ResponseWriter, r *http.Request, policy files.Policy, userID *int64, scope string) {
	name, data, ok := readUpload(w, r, policy.MaxSize)
	if !ok {
		return
	}
	prepared, err := files.Prepare(name, data, policy)
	if err != nil {
		var rej *files.RejectError
		if errors.As(err, &rej) {
			httpx.Fail(w, &httpx.ValidationError{Fields: map[string]string{"file": rej.Msg}})
			return
		}
		httpx.Fail(w, err)
		return
	}
	ctx := r.Context()
	if scope == store.ScopeContent {
		existing, err := h.store.ContentAttachmentBySHA(ctx, prepared.SHA256)
		if err == nil {
			httpx.JSON(w, http.StatusOK, existing)
			return
		}
		if !errors.Is(err, httpx.ErrNotFound) {
			httpx.Fail(w, err)
			return
		}
	}
	id := files.NewID()
	if err := h.files.Put(ctx, id, prepared.ContentType, prepared.Data); err != nil {
		httpx.Fail(w, fmt.Errorf("store file: %w", err))
		return
	}
	a, err := h.store.CreateAttachment(ctx, store.NewAttachment{
		ID: id, Name: prepared.Name, Slug: files.URLName(prepared.Name), ContentType: prepared.ContentType,
		SHA256: prepared.SHA256, Size: int64(len(prepared.Data)), Width: prepared.Width, Height: prepared.Height,
		UserID: userID, Scope: scope,
	})
	if err != nil {
		_ = h.files.Delete(ctx, id)
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, a)
}

// uploadFile: a student's photo or PDF for a future comment or post.
func (h *Handler) uploadFile(w http.ResponseWriter, r *http.Request) {
	if !h.filesReady(w) {
		return
	}
	userID, _ := userauth.UserID(r.Context())
	n, err := h.store.CountUserUploads(r.Context(), userID, time.Now().Add(-uploadWindow))
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if n >= uploadLimit {
		httpx.Error(w, http.StatusTooManyRequests, "rate_limited",
			fmt.Sprintf("Не больше %d файлов за %d часов. Попробуйте позже", uploadLimit, int(uploadWindow/time.Hour)))
		return
	}
	h.storeUpload(w, r, files.StudentPolicy, &userID, store.ScopeSocial)
}

// serveFile streams a file if the viewer may see it. Invisible and missing
// files are both 404, so ids of hidden files do not leak.
func (h *Handler) serveFile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if h.files == nil || !files.ValidID(id) {
		httpx.Fail(w, httpx.ErrNotFound)
		return
	}
	ctx := r.Context()
	a, err := h.store.GetAttachmentAccess(ctx, id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	viewer, _ := userauth.UserID(ctx)
	private := false
	switch {
	case h.auth != nil && h.auth.Authenticated(ctx, r):
		// Админ видит всё: модерация, незаконченные загрузки, посты «для своих».
		private = a.Place == models.PlacePending || a.Visibility != models.VisiblePublic
	case a.Place == models.PlacePending:
		// Незаконченную загрузку видит только автор.
		if a.UserID == nil || *a.UserID != viewer {
			httpx.Fail(w, httpx.ErrNotFound)
			return
		}
		private = true
	case a.Visibility != models.VisiblePublic:
		if viewer == 0 {
			httpx.Fail(w, httpx.ErrNotFound)
			return
		}
		private = true
	}
	if h.servePreview(w, r, a.Attachment, private) {
		return
	}
	obj, err := h.files.Open(ctx, id)
	if errors.Is(err, files.ErrNotExist) {
		slog.Warn("file row without object", "id", id)
		httpx.Fail(w, httpx.ErrNotFound)
		return
	}
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	defer obj.Close()

	fileHeaders(w, r, a.ContentType, a.Name, private)
	w.Header().Set("ETag", `"`+id+`"`)
	_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(10 * time.Minute))
	http.ServeContent(w, r, "", obj.ModTime(), obj)
}

// fileHeaders sets what every file response carries: type, disposition,
// sandbox and caching.
func fileHeaders(w http.ResponseWriter, r *http.Request, contentType, name string, private bool) {
	hdr := w.Header()
	hdr.Set("Content-Type", contentType)
	hdr.Set("X-Content-Type-Options", "nosniff")
	disposition := "attachment"
	if files.Inline(contentType) && r.URL.Query().Get("download") == "" {
		disposition = "inline"
	}
	hdr.Set("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": name}))
	// Открытый напрямую файл — отдельный документ на нашем домене: песочница не
	// даёт SVG или HTML выполнить скрипт. PDF-просмотрщик Chrome в песочнице не
	// работает, а скриптов страницы у PDF и так нет.
	if !strings.HasPrefix(contentType, "application/pdf") {
		hdr.Set("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; media-src 'self'; sandbox")
	}
	if private {
		hdr.Set("Cache-Control", "private, max-age=3600")
	} else {
		// Содержимое по id никогда не меняется.
		hdr.Set("Cache-Control", "public, max-age=31536000, immutable")
	}
}

// servePreview answers ?w= with a smaller copy from imgproxy. It returns false
// when the original should be served instead: no imgproxy, a type it does not
// touch, a picture already narrower than asked, a download, or imgproxy failing
// (the page then still shows the picture, just heavier).
func (h *Handler) servePreview(w http.ResponseWriter, r *http.Request, a models.Attachment, private bool) bool {
	width := files.PreviewWidth(r.URL.Query().Get("w"))
	if h.resizer == nil || width == 0 || !files.Resizable(a.ContentType) || r.URL.Query().Get("download") != "" {
		return false
	}
	if a.Width != nil && *a.Width <= width {
		return false
	}
	format := files.PreviewFormat(r.Header.Get("Accept"), a.ContentType)
	etag := fmt.Sprintf(`"%s-w%d.%s"`, a.ID, width, format)
	w.Header().Set("Vary", "Accept")
	if r.Header.Get("If-None-Match") == etag {
		w.Header().Set("ETag", etag)
		w.WriteHeader(http.StatusNotModified)
		return true
	}
	res, err := h.resizer.Fetch(r.Context(), a.ID, width, format)
	if err != nil {
		slog.Warn("imgproxy preview failed, serving the original", "id", a.ID, "width", width, "err", err)
		w.Header().Del("Vary")
		return false
	}
	defer res.Body.Close()
	name := strings.TrimSuffix(a.Name, path.Ext(a.Name)) + "." + format
	fileHeaders(w, r, res.Header.Get("Content-Type"), name, private)
	w.Header().Set("ETag", etag)
	if n := res.Header.Get("Content-Length"); n != "" {
		w.Header().Set("Content-Length", n)
	}
	_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(10 * time.Minute))
	if _, err := io.Copy(w, res.Body); err != nil {
		slog.Warn("stream preview", "id", a.ID, "err", err)
	}
	return true
}

// ---- admin ----

// adminUploadFile stores a file for texts, or with ?scope=social one to attach
// to any comment or post when moderating.
func (h *Handler) adminUploadFile(w http.ResponseWriter, r *http.Request) {
	if !h.filesReady(w) {
		return
	}
	scope := store.ScopeContent
	if r.URL.Query().Get("scope") == store.ScopeSocial {
		scope = store.ScopeSocial
	}
	h.storeUpload(w, r, files.AdminPolicy, nil, scope)
}

func (h *Handler) adminListFiles(w http.ResponseWriter, r *http.Request) {
	items, err := h.store.ListAttachments(r.Context(), adminFilesLimit)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, items)
}

// adminDeleteFile removes any file, including a student's photo (moderation).
// Links to it in texts start returning 404.
func (h *Handler) adminDeleteFile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !files.ValidID(id) {
		httpx.Fail(w, httpx.ErrNotFound)
		return
	}
	if err := h.store.DeleteAttachment(r.Context(), id); err != nil {
		httpx.Fail(w, err)
		return
	}
	if h.files != nil {
		// Не вышло — объект уберёт сборщик мусора.
		if err := h.files.Delete(r.Context(), id); err != nil {
			slog.Warn("delete file object", "id", id, "err", err)
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// isFileTransfer marks requests exempt from the 30-second handler timeout:
// uploads and downloads on a slow connection legitimately take longer.
func isFileTransfer(r *http.Request) bool {
	p := r.URL.Path
	if strings.HasPrefix(p, "/api/v1/files/") {
		return true
	}
	return r.Method == http.MethodPost && (p == "/api/v1/files" || p == "/api/v1/admin/files")
}
