package files

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"strings"
	"testing"
)

func animatedGIF(t *testing.T) []byte {
	t.Helper()
	pal := color.Palette{color.Black, color.White}
	g := &gif.GIF{}
	for i := range 3 {
		fr := image.NewPaletted(image.Rect(0, 0, 32, 32), pal)
		fr.SetColorIndex(i, i, 1)
		g.Image = append(g.Image, fr)
		g.Delay = append(g.Delay, 5)
	}
	var buf bytes.Buffer
	if err := gif.EncodeAll(&buf, g); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func onePixelPNG(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 1, 1))); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestPrepareAvatar(t *testing.T) {
	t.Run("jpeg", func(t *testing.T) {
		var buf bytes.Buffer
		_ = jpeg.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 320, 320)), nil)
		p, err := PrepareAvatar(buf.Bytes())
		if err != nil || p.ContentType != "image/jpeg" || p.Width != 320 {
			t.Fatalf("got %+v, %v", p, err)
		}
	})
	t.Run("animated gif becomes a still png", func(t *testing.T) {
		p, err := PrepareAvatar(animatedGIF(t))
		if err != nil || p.ContentType != "image/png" {
			t.Fatalf("got %+v, %v", p, err)
		}
	})
	for name, data := range map[string][]byte{
		"empty":   nil,
		"pdf":     []byte("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n"),
		"svg":     []byte(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`),
		"html":    []byte("<html><script>alert(1)</script></html>"),
		"garbage": bytes.Repeat([]byte{0x00, 0x01, 0x02}, 100),
		"cut gif": animatedGIF(t)[:20],
		"1px":     onePixelPNG(t),
		"too big": append([]byte("\xff\xd8\xff"), make([]byte, AvatarPolicy.MaxSize)...),
	} {
		t.Run("rejects "+name, func(t *testing.T) {
			if _, err := PrepareAvatar(data); err == nil {
				t.Fatal("expected a rejection")
			}
		})
	}
}

func TestTelegramHost(t *testing.T) {
	for host, want := range map[string]bool{
		"t.me": true, "cdn4.cdn-telegram.org": true, "cdn1.telesco.pe": true, "api.telegram.org": true,
		"evil.com": false, "t.me.evil.com": false, "nott.me": false, "127.0.0.1": false, "localhost": false,
	} {
		if got := telegramHost(host); got != want {
			t.Errorf("telegramHost(%q) = %v, want %v", host, got, want)
		}
	}
}

func TestFetchAvatarRefusesForeignAddresses(t *testing.T) {
	for _, u := range []string{"http://t.me/i/userpic/1.jpg", "https://evil.example/a.jpg", "https://127.0.0.1/a.jpg", "file:///etc/passwd", "", strings.Repeat("x", 10)} {
		if _, err := FetchAvatar(context.Background(), u); err == nil {
			t.Errorf("FetchAvatar(%q) succeeded", u)
		}
	}
}
