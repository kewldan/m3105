package files

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image/gif"
	"image/png"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// minAvatarSide is the smallest usable side of a profile picture, in pixels.
const minAvatarSide = 16

// AvatarPolicy limits profile pictures: only images, and small ones.
var AvatarPolicy = Policy{MaxSize: 5 << 20}

// PrepareAvatar checks a downloaded profile picture. Besides what Prepare does
// (real type from the bytes, EXIF stripped, size limits) it keeps avatars still:
// an animated GIF becomes a PNG of its first frame, so a list of twenty names
// does not play twenty animations. Animated WebP is refused by Prepare itself
// (the decoder does not read it), and the person gets initials instead.
func PrepareAvatar(data []byte) (*Prepared, error) {
	if bytes.HasPrefix(data, []byte("GIF8")) {
		g, err := gif.Decode(bytes.NewReader(data))
		if err != nil {
			return nil, reject("Картинка повреждена, её не получилось прочитать")
		}
		var buf bytes.Buffer
		if err := png.Encode(&buf, g); err != nil {
			return nil, err
		}
		data = buf.Bytes()
	}
	p, err := Prepare("avatar", data, AvatarPolicy)
	if err != nil {
		return nil, err
	}
	if !strings.HasPrefix(p.ContentType, "image/") || p.ContentType == "image/svg+xml" {
		return nil, reject("Аватарка должна быть картинкой")
	}
	// Telegram иногда отвечает заглушкой в один-два пикселя: лучше инициалы, чем пустой кружок.
	if p.Width < minAvatarSide || p.Height < minAvatarSide {
		return nil, reject("Аватарка слишком маленькая")
	}
	return p, nil
}

// telegramHost reports whether the host serves Telegram profile photos. The
// Login Widget signs photo_url, but the host is checked anyway: the server must
// never be turned into a proxy to arbitrary addresses.
func telegramHost(host string) bool {
	host = strings.ToLower(host)
	for _, d := range []string{"t.me", "telegram.org", "telegram-cdn.org", "cdn-telegram.org", "telesco.pe"} {
		if host == d || strings.HasSuffix(host, "."+d) {
			return true
		}
	}
	return false
}

var avatarClient = &http.Client{
	Timeout: 15 * time.Second,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 3 || req.URL.Scheme != "https" || !telegramHost(req.URL.Hostname()) {
			return errors.New("redirect to a foreign address")
		}
		return nil
	},
}

// FetchAvatar downloads a Telegram profile photo, at most AvatarPolicy.MaxSize bytes.
func FetchAvatar(ctx context.Context, rawURL string) ([]byte, error) {
	u, err := url.Parse(rawURL)
	if err != nil || u.Scheme != "https" || !telegramHost(u.Hostname()) {
		return nil, fmt.Errorf("not a telegram photo address: %q", rawURL)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	res, err := avatarClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("telegram photo: %s", res.Status)
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, AvatarPolicy.MaxSize+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > AvatarPolicy.MaxSize {
		return nil, errors.New("telegram photo is too large")
	}
	return data, nil
}
