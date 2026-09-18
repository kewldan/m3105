package files

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"
)

// Превью картинок делает imgproxy (libvips): уменьшает по ширине и пережимает
// в WebP. Он живёт во внутренней сети и читает оригиналы прямо из бакета, а
// ходит к нему только API — уже после проверки прав, поэтому скрытые файлы
// не утекают через превью. Без imgproxy отдаются оригиналы.

// Widths are the only preview sizes: a fixed list keeps imgproxy from being
// asked for a thousand variants of one photo.
var Widths = []int{160, 320, 640, 1280, 1920}

// ImgproxyConfig points at the internal imgproxy. Key and salt are hex, as in
// IMGPROXY_KEY / IMGPROXY_SALT; empty ones mean unsigned URLs.
type ImgproxyConfig struct {
	URL  string
	Key  string
	Salt string
}

// Resizer requests previews from imgproxy.
type Resizer struct {
	base      string
	key, salt []byte
	// source is the prefix imgproxy reads originals from: s3://bucket/ or local:///.
	source string
	client *http.Client
}

// NewResizer returns nil when imgproxy is not configured or the storage is one
// imgproxy cannot read.
func NewResizer(cfg ImgproxyConfig, storage Config) (*Resizer, error) {
	if cfg.URL == "" {
		return nil, nil
	}
	key, err := hex.DecodeString(cfg.Key)
	if err != nil {
		return nil, fmt.Errorf("IMGPROXY_KEY is not hex: %w", err)
	}
	salt, err := hex.DecodeString(cfg.Salt)
	if err != nil {
		return nil, fmt.Errorf("IMGPROXY_SALT is not hex: %w", err)
	}
	var source string
	switch {
	case storage.S3.Endpoint != "":
		source = "s3://" + storage.S3.Bucket + "/"
	case storage.Dir != "":
		// imgproxy с IMGPROXY_LOCAL_FILESYSTEM_ROOT, указывающим на тот же каталог.
		source = "local:///"
	default:
		return nil, errors.New("imgproxy needs S3_ENDPOINT or FILES_DIR")
	}
	return &Resizer{
		base:   strings.TrimRight(cfg.URL, "/"),
		key:    key,
		salt:   salt,
		source: source,
		client: &http.Client{Timeout: 30 * time.Second},
	}, nil
}

// Sign returns the signature segment for a path like /rs:fit:640:0/plain/…
func Sign(key, salt []byte, path string) string {
	if len(key) == 0 {
		return "insecure"
	}
	mac := hmac.New(sha256.New, key)
	mac.Write(salt)
	mac.Write([]byte(path))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// Path builds the signed imgproxy path of a preview: fit into width, keep the
// aspect ratio, never enlarge, convert to format (webp, jpg, png).
func (r *Resizer) Path(id string, width int, format string) string {
	path := "/rs:fit:" + strconv.Itoa(width) + ":0/q:80/plain/" + r.source + id + "@" + format
	return "/" + Sign(r.key, r.salt, path) + path
}

// Fetch requests a preview; the caller closes the body. Anything but 200 is an error.
func (r *Resizer) Fetch(ctx context.Context, id string, width int, format string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, r.base+r.Path(id, width, format), nil)
	if err != nil {
		return nil, err
	}
	res, err := r.client.Do(req)
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		_ = res.Body.Close()
		return nil, fmt.Errorf("imgproxy: status %d", res.StatusCode)
	}
	return res, nil
}

// PreviewWidth parses ?w=: only listed widths count, anything else means the original.
func PreviewWidth(raw string) int {
	w, err := strconv.Atoi(raw)
	if err != nil || !slices.Contains(Widths, w) {
		return 0
	}
	return w
}

// Resizable reports whether imgproxy should touch the type: animated GIFs and
// SVG stay as they are.
func Resizable(contentType string) bool {
	switch contentType {
	case "image/jpeg", "image/png", "image/webp":
		return true
	}
	return false
}

// PreviewFormat picks the output: WebP when the browser says it takes it (all
// current ones do), otherwise the source's own format.
func PreviewFormat(accept, contentType string) string {
	if strings.Contains(accept, "image/webp") {
		return "webp"
	}
	if contentType == "image/png" {
		return "png"
	}
	return "jpg"
}
