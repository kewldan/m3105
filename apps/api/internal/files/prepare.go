package files

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"image"
	_ "image/gif" // DecodeConfig for uploaded GIFs
	_ "image/jpeg"
	_ "image/png"
	"mime"
	"net/http"
	"path"
	"strings"
	"unicode"
	"unicode/utf8"

	_ "golang.org/x/image/webp"

	"github.com/kewldan/edu3105/apps/api/internal/slug"
)

// Policy says what a caller may upload.
type Policy struct {
	MaxSize int64
	// AnyType lets admins attach any file; students get images and PDF only.
	AnyType bool
}

var (
	// StudentPolicy covers comments and posts.
	StudentPolicy = Policy{MaxSize: 10 << 20}
	// AdminPolicy covers files in notes, labs and pages.
	AdminPolicy = Policy{MaxSize: 50 << 20, AnyType: true}
)

// maxPixels stops decompression bombs: a tiny PNG that claims to be 100 000 px
// wide would hang every browser that opens the comment.
const maxPixels = 60_000_000

// Prepared is a checked upload ready to be stored.
type Prepared struct {
	Name        string
	ContentType string
	Data        []byte
	// Width and Height are display dimensions (after EXIF rotation), 0 for non-images.
	Width, Height int
	SHA256        string
}

// RejectError is a user-facing reason to refuse the file (sent as 422).
type RejectError struct{ Msg string }

func (e *RejectError) Error() string { return e.Msg }

func reject(format string, args ...any) error {
	return &RejectError{Msg: fmt.Sprintf(format, args...)}
}

// canonicalExt is the extension a stored file gets when the uploaded name lacks one.
var canonicalExt = map[string][]string{
	"image/jpeg":      {".jpg", ".jpeg"},
	"image/png":       {".png"},
	"image/gif":       {".gif"},
	"image/webp":      {".webp"},
	"application/pdf": {".pdf"},
}

// byExtension covers what admins attach besides images and PDF. Go's own table
// is tiny, and the distroless image has no /etc/mime.types.
var byExtension = map[string]string{
	".svg":  "image/svg+xml",
	".txt":  "text/plain",
	".md":   "text/markdown",
	".csv":  "text/csv",
	".json": "application/json",
	".zip":  "application/zip",
	".7z":   "application/x-7z-compressed",
	".rar":  "application/vnd.rar",
	".tar":  "application/x-tar",
	".gz":   "application/gzip",
	".doc":  "application/msword",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".xls":  "application/vnd.ms-excel",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".ppt":  "application/vnd.ms-powerpoint",
	".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	".odt":  "application/vnd.oasis.opendocument.text",
	".ods":  "application/vnd.oasis.opendocument.spreadsheet",
	".odp":  "application/vnd.oasis.opendocument.presentation",
	".mp3":  "audio/mpeg",
	".mp4":  "video/mp4",
	".webm": "video/webm",
}

// Prepare checks an upload against the policy, sniffs its real type (the name
// and the browser's Content-Type are not trusted), strips photo metadata and
// measures images.
func Prepare(name string, data []byte, p Policy) (*Prepared, error) {
	if len(data) == 0 {
		return nil, reject("Файл пустой")
	}
	if int64(len(data)) > p.MaxSize {
		return nil, reject("Файл больше %d МБ", p.MaxSize>>20)
	}
	out := &Prepared{Name: CleanName(name), Data: data}
	sniffed, _, _ := mime.ParseMediaType(http.DetectContentType(data))
	ext := strings.ToLower(path.Ext(out.Name))

	switch sniffed {
	case "image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf":
		out.ContentType = sniffed
	default:
		if !p.AnyType {
			return nil, reject("Можно прикреплять картинки (JPG, PNG, GIF, WebP) и PDF")
		}
		out.ContentType = byExtension[ext]
		switch out.ContentType {
		case "image/svg+xml":
			if !bytes.Contains(data[:min(len(data), 4096)], []byte("<svg")) {
				out.ContentType = "application/octet-stream"
			}
		case "":
			if strings.HasPrefix(sniffed, "text/") && sniffed != "text/html" {
				out.ContentType = "text/plain"
			} else {
				out.ContentType = "application/octet-stream"
			}
		}
		if strings.HasPrefix(out.ContentType, "text/") && utf8.Valid(data) {
			out.ContentType += "; charset=utf-8"
		}
	}

	if exts, ok := canonicalExt[out.ContentType]; ok {
		known := false
		for _, e := range exts {
			known = known || e == ext
		}
		if !known {
			out.Name = strings.TrimSuffix(out.Name, path.Ext(out.Name)) + exts[0]
		}
	}

	if strings.HasPrefix(out.ContentType, "image/") && out.ContentType != "image/svg+xml" {
		if err := out.prepareImage(); err != nil {
			return nil, err
		}
	}
	sum := sha256.Sum256(out.Data)
	out.SHA256 = hex.EncodeToString(sum[:])
	return out, nil
}

func (out *Prepared) prepareImage() error {
	orientation := 1
	var err error
	switch out.ContentType {
	case "image/jpeg":
		out.Data, orientation, err = stripJPEG(out.Data)
	case "image/png":
		out.Data, err = stripPNG(out.Data)
	case "image/webp":
		out.Data, err = stripWebP(out.Data)
	}
	if err != nil {
		return reject("Картинка повреждена, её не получилось прочитать")
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(out.Data))
	if err != nil {
		return reject("Картинка повреждена, её не получилось прочитать")
	}
	if int64(cfg.Width)*int64(cfg.Height) > maxPixels {
		return reject("Слишком большая картинка: больше %d мегапикселей", maxPixels/1_000_000)
	}
	out.Width, out.Height = cfg.Width, cfg.Height
	if orientation >= 5 { // повёрнута на 90°: браузер покажет её с переставленными сторонами
		out.Width, out.Height = out.Height, out.Width
	}
	return nil
}

// CleanName keeps the last path element, drops control characters and limits
// the length without losing the extension.
func CleanName(name string) string {
	if i := strings.LastIndexAny(name, `/\`); i >= 0 {
		name = name[i+1:]
	}
	name = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || r == '"' {
			return -1
		}
		return r
	}, name)
	name = strings.Trim(strings.TrimSpace(name), ".")
	if name == "" {
		return "file"
	}
	const maxRunes = 100
	if utf8.RuneCountInString(name) > maxRunes {
		ext := path.Ext(name)
		if utf8.RuneCountInString(ext) > 10 {
			ext = ""
		}
		stem := []rune(strings.TrimSuffix(name, ext))
		name = strings.TrimSpace(string(stem[:maxRunes-utf8.RuneCountInString(ext)])) + ext
	}
	return name
}

// URLName is the ASCII last segment of a file URL: transliterated stem plus the
// extension. The server ignores it, it only makes links readable and gives
// downloads a sensible name in browsers that ignore Content-Disposition.
func URLName(name string) string {
	ext := strings.ToLower(path.Ext(name))
	if !validExt(ext) {
		ext = ""
	}
	return slug.Make(strings.TrimSuffix(name, path.Ext(name))) + ext
}

func validExt(ext string) bool {
	if len(ext) < 2 || len(ext) > 10 {
		return false
	}
	for _, r := range ext[1:] {
		if (r < 'a' || r > 'z') && (r < '0' || r > '9') {
			return false
		}
	}
	return true
}

// Inline reports whether the browser may show the file itself instead of
// downloading it. Everything else is served as an attachment, so an uploaded
// HTML page can never run on the site's origin.
func Inline(contentType string) bool {
	switch contentType {
	case "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
		"application/pdf", "video/mp4", "video/webm", "audio/mpeg":
		return true
	}
	return false
}
