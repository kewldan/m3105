package files

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// gpsMarker stands in for real GPS tags: the test only checks it is gone.
const gpsMarker = "GPSLatitude=59.957N"

func testImage(w, h int) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := range h {
		for x := range w {
			img.Set(x, y, color.RGBA{uint8(x * 10), uint8(y * 10), 128, 255})
		}
	}
	return img
}

// exifSegment builds an APP1 EXIF block with an orientation tag followed by a
// payload that imitates the rest of the camera metadata.
func exifSegment(orientation int, little bool) []byte {
	var order binary.AppendByteOrder = binary.BigEndian
	head := []byte("MM\x00\x2a")
	if little {
		order = binary.LittleEndian
		head = []byte("II\x2a\x00")
	}
	tiff := append([]byte(nil), head...)
	tiff = order.AppendUint32(tiff, 8)
	tiff = order.AppendUint16(tiff, 1)
	tiff = order.AppendUint16(tiff, 0x0112)
	tiff = order.AppendUint16(tiff, 3)
	tiff = order.AppendUint32(tiff, 1)
	tiff = order.AppendUint16(tiff, uint16(orientation))
	tiff = append(tiff, 0, 0, 0, 0, 0, 0)
	tiff = append(tiff, gpsMarker...)
	payload := append([]byte("Exif\x00\x00"), tiff...)
	seg := []byte{0xFF, 0xE1}
	seg = binary.BigEndian.AppendUint16(seg, uint16(len(payload)+2))
	return append(seg, payload...)
}

func jpegWithExif(t *testing.T, w, h, orientation int, little bool) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, testImage(w, h), nil); err != nil {
		t.Fatal(err)
	}
	raw := buf.Bytes()
	out := append([]byte(nil), raw[:2]...)
	out = append(out, exifSegment(orientation, little)...)
	out = append(out, 0xFF, 0xFE, 0, 2+byte(len(gpsMarker))) // COM with the same marker
	out = append(out, gpsMarker...)
	return append(out, raw[2:]...)
}

func TestPrepareJPEGStripsExifKeepsOrientation(t *testing.T) {
	for _, little := range []bool{false, true} {
		src := jpegWithExif(t, 40, 20, 6, little)
		p, err := Prepare("IMG_0001.JPG", src, StudentPolicy)
		if err != nil {
			t.Fatal(err)
		}
		if bytes.Contains(p.Data, []byte(gpsMarker)) {
			t.Fatal("GPS metadata survived")
		}
		if p.ContentType != "image/jpeg" || p.Name != "IMG_0001.JPG" {
			t.Fatalf("unexpected type or name: %q %q", p.ContentType, p.Name)
		}
		// Orientation 6 is a 90° turn: the browser shows 20×40.
		if p.Width != 20 || p.Height != 40 {
			t.Fatalf("display size %d×%d, want 20×40", p.Width, p.Height)
		}
		segs, _, err := jpegSegments(p.Data)
		if err != nil {
			t.Fatal(err)
		}
		found := false
		for _, s := range segs {
			if s.marker == 0xE1 {
				found = exifOrientation(s.raw[10:]) == 6
			}
		}
		if !found {
			t.Fatal("orientation was not carried over")
		}
		if _, err := jpeg.Decode(bytes.NewReader(p.Data)); err != nil {
			t.Fatalf("stripped JPEG does not decode: %v", err)
		}
	}
}

func TestPrepareJPEGWithoutRotation(t *testing.T) {
	p, err := Prepare("photo.jpeg", jpegWithExif(t, 30, 10, 1, false), StudentPolicy)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(p.Data, []byte("Exif")) || p.Width != 30 || p.Height != 10 {
		t.Fatalf("EXIF left or size wrong: %d×%d", p.Width, p.Height)
	}
}

func pngChunk(typ string, data []byte) []byte {
	out := binary.BigEndian.AppendUint32(nil, uint32(len(data)))
	body := append([]byte(typ), data...)
	out = append(out, body...)
	return binary.BigEndian.AppendUint32(out, crc32.ChecksumIEEE(body))
}

func TestPreparePNGStripsText(t *testing.T) {
	var buf bytes.Buffer
	if err := png.Encode(&buf, testImage(8, 6)); err != nil {
		t.Fatal(err)
	}
	raw := buf.Bytes()
	ihdrEnd := 8 + 12 + 13
	src := append([]byte(nil), raw[:ihdrEnd]...)
	src = append(src, pngChunk("tEXt", []byte("Comment\x00"+gpsMarker))...)
	src = append(src, raw[ihdrEnd:]...)

	p, err := Prepare("screenshot", src, StudentPolicy)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(p.Data, []byte(gpsMarker)) {
		t.Fatal("tEXt chunk survived")
	}
	if p.Name != "screenshot.png" || p.Width != 8 || p.Height != 6 {
		t.Fatalf("name %q size %d×%d", p.Name, p.Width, p.Height)
	}
	if _, err := png.Decode(bytes.NewReader(p.Data)); err != nil {
		t.Fatalf("stripped PNG does not decode: %v", err)
	}
}

// 1×1 lossless WebP.
const tinyWebP = "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=="

func TestPrepareWebPStripsExif(t *testing.T) {
	raw, _ := base64.StdEncoding.DecodeString(tinyWebP)
	vp8l := raw[12:]
	vp8x := []byte("VP8X")
	vp8x = binary.LittleEndian.AppendUint32(vp8x, 10)
	vp8x = append(vp8x, 0x08, 0, 0, 0, 0, 0, 0, 0, 0, 0) // EXIF flag, 1×1 canvas
	exif := append([]byte("EXIF"), binary.LittleEndian.AppendUint32(nil, uint32(len(gpsMarker)))...)
	exif = append(exif, gpsMarker...)
	if len(gpsMarker)%2 == 1 {
		exif = append(exif, 0)
	}
	body := append(append(append([]byte("WEBP"), vp8x...), vp8l...), exif...)
	src := append([]byte("RIFF"), binary.LittleEndian.AppendUint32(nil, uint32(len(body)))...)
	src = append(src, body...)

	p, err := Prepare("pic.webp", src, StudentPolicy)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(p.Data, []byte(gpsMarker)) || bytes.Contains(p.Data, []byte("EXIF")) {
		t.Fatal("EXIF chunk survived")
	}
	if got := binary.LittleEndian.Uint32(p.Data[4:8]); int(got) != len(p.Data)-8 {
		t.Fatalf("RIFF size %d, file %d", got, len(p.Data))
	}
	if p.Data[20]&0x08 != 0 {
		t.Fatal("EXIF flag left in VP8X")
	}
	if p.Width != 1 || p.Height != 1 {
		t.Fatalf("size %d×%d", p.Width, p.Height)
	}
}

func TestPreparePolicies(t *testing.T) {
	pdf := []byte("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF")
	html := []byte("<!DOCTYPE html><html><script>alert(1)</script></html>")
	zip := []byte("PK\x03\x04" + strings.Repeat("\x00", 40))
	svg := []byte(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>`)

	if p, err := Prepare("lab", pdf, StudentPolicy); err != nil || p.ContentType != "application/pdf" || p.Name != "lab.pdf" {
		t.Fatalf("student PDF: %+v %v", p, err)
	}
	for name, data := range map[string][]byte{"page.html": html, "code.zip": zip, "pic.svg": svg} {
		var rej *RejectError
		if _, err := Prepare(name, data, StudentPolicy); !errors.As(err, &rej) {
			t.Fatalf("student %s must be rejected, got %v", name, err)
		}
	}
	cases := map[string]string{
		"page.html":   "application/octet-stream", // never text/html: it would run on our origin
		"report.docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"scheme.svg":  "image/svg+xml",
		"notes.txt":   "text/plain; charset=utf-8",
	}
	data := map[string][]byte{"page.html": html, "report.docx": zip, "scheme.svg": svg, "notes.txt": []byte("привет")}
	for name, want := range cases {
		p, err := Prepare(name, data[name], AdminPolicy)
		if err != nil || p.ContentType != want {
			t.Fatalf("admin %s: type %q err %v, want %q", name, p.ContentType, err, want)
		}
	}
	// A JPEG named .png is still a JPEG: the content decides.
	var buf bytes.Buffer
	_ = jpeg.Encode(&buf, testImage(2, 2), nil)
	if p, err := Prepare("fake.png", buf.Bytes(), StudentPolicy); err != nil || p.ContentType != "image/jpeg" || p.Name != "fake.jpg" {
		t.Fatalf("renamed JPEG: %+v %v", p, err)
	}
	if _, err := Prepare("big.pdf", append(pdf, make([]byte, StudentPolicy.MaxSize)...), StudentPolicy); err == nil {
		t.Fatal("oversized file accepted")
	}
	if _, err := Prepare("empty.png", nil, StudentPolicy); err == nil {
		t.Fatal("empty file accepted")
	}
	broken := append([]byte("\xff\xd8\xff\xe0"), make([]byte, 20)...)
	if _, err := Prepare("broken.jpg", broken, StudentPolicy); err == nil {
		t.Fatal("broken JPEG accepted")
	}
}

func TestNames(t *testing.T) {
	cases := map[string]string{
		`C:\Users\me\Отчёт.pdf`: "Отчёт.pdf",
		"../../etc/passwd":      "passwd",
		"  .hidden. ":           "hidden",
		"a\x00b\"c.txt":         "abc.txt",
		"":                      "file",
	}
	for in, want := range cases {
		if got := CleanName(in); got != want {
			t.Errorf("CleanName(%q) = %q, want %q", in, got, want)
		}
	}
	long := CleanName(strings.Repeat("я", 300) + ".pdf")
	if !strings.HasSuffix(long, ".pdf") || len([]rune(long)) != 100 {
		t.Errorf("long name cut badly: %d runes, %q", len([]rune(long)), long[len(long)-8:])
	}
	if got := URLName("Лабораторная №3 (итог).PDF"); got != "laboratornaya-3-itog.pdf" {
		t.Errorf("URLName = %q", got)
	}
	if !ValidID(NewID()) || ValidID("../etc") {
		t.Error("ValidID/NewID disagree")
	}
}

type fakeIndex struct {
	ids   map[string]bool
	stale int64
}

func (f *fakeIndex) DeleteStaleUploads(context.Context, time.Time) (int64, error) {
	return f.stale, nil
}
func (f *fakeIndex) AttachmentIDs(context.Context) (map[string]bool, error) { return f.ids, nil }

func TestCollectDeletesOrphans(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	d, err := NewDir(root)
	if err != nil {
		t.Fatal(err)
	}
	keep, orphan, fresh := NewID(), NewID(), NewID()
	for _, id := range []string{keep, orphan, fresh} {
		if err := d.Put(ctx, id, "text/plain", []byte(id)); err != nil {
			t.Fatal(err)
		}
	}
	old := time.Now().Add(-2 * time.Hour)
	for _, id := range []string{keep, orphan} {
		if err := os.Chtimes(filepath.Join(root, id), old, old); err != nil {
			t.Fatal(err)
		}
	}
	if err := Collect(ctx, &fakeIndex{ids: map[string]bool{keep: true}}, d); err != nil {
		t.Fatal(err)
	}
	for id, want := range map[string]bool{keep: true, orphan: false, fresh: true} {
		obj, err := d.Open(ctx, id)
		if got := err == nil; got != want {
			t.Errorf("%s exists=%v, want %v (%v)", id, got, want, err)
		}
		if obj != nil {
			_ = obj.Close()
		}
	}
}

func TestImgproxySign(t *testing.T) {
	// Пример из документации imgproxy (docs.imgproxy.net/usage/signing_url).
	key, _ := hex.DecodeString("736563726574")
	salt, _ := hex.DecodeString("68656C6C6F")
	got := Sign(key, salt, "/rs:fill:300:400:0/g:sm/aHR0cDovL2V4YW1w/bGUuY29tL2ltYWdl/cy9jdXJpb3NpdHku/anBn.png")
	if got != "oKfUtW34Dvo2BGQehJFR4Nr0_rIjOtdtzJ3QFsUcXH8" {
		t.Fatalf("signature %q", got)
	}
	if Sign(nil, nil, "/x") != "insecure" {
		t.Fatal("no key must give an unsigned URL")
	}
	r, err := NewResizer(ImgproxyConfig{URL: "http://imgproxy:8080/", Key: "736563726574", Salt: "68656C6C6F"},
		Config{S3: S3Config{Endpoint: "minio:9000", Bucket: "edu3105"}})
	if err != nil {
		t.Fatal(err)
	}
	id := NewID()
	want := "/rs:fit:640:0/q:80/plain/s3://edu3105/" + id + "@webp"
	if p := r.Path(id, 640, "webp"); p != "/"+Sign(key, salt, want)+want {
		t.Fatalf("path %q", p)
	}
	if _, err := NewResizer(ImgproxyConfig{URL: "http://x", Key: "zz"}, Config{Dir: "/tmp"}); err == nil {
		t.Fatal("non-hex key accepted")
	}
	if r, err := NewResizer(ImgproxyConfig{}, Config{Dir: "/tmp"}); r != nil || err != nil {
		t.Fatal("imgproxy without URL must be off")
	}
	if PreviewWidth("640") != 640 || PreviewWidth("641") != 0 || PreviewWidth("x") != 0 {
		t.Fatal("PreviewWidth")
	}
	if PreviewFormat("image/avif,image/webp,*/*", "image/jpeg") != "webp" || PreviewFormat("*/*", "image/png") != "png" ||
		PreviewFormat("", "image/jpeg") != "jpg" {
		t.Fatal("PreviewFormat")
	}
}
