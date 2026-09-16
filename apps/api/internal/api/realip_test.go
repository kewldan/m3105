package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTrustedRealIP(t *testing.T) {
	cases := []struct {
		name   string
		remote string
		xff    string
		xreal  string
		want   string
	}{
		{"из nginx берём X-Forwarded-For", "172.18.0.5:41234", "203.0.113.7", "", "203.0.113.7:41234"},
		{"из nginx берём X-Real-IP", "10.0.0.2:41234", "", "203.0.113.8", "203.0.113.8:41234"},
		{"из интернета заголовкам не верим", "203.0.113.9:41234", "198.51.100.1", "198.51.100.1", "203.0.113.9:41234"},
		{"мусор в заголовке игнорируем", "127.0.0.1:41234", "not-an-ip", "", "127.0.0.1:41234"},
		{"берём левый адрес цепочки", "127.0.0.1:41234", "203.0.113.10, 172.18.0.5", "", "203.0.113.10:41234"},
		{"без заголовков ничего не меняем", "172.18.0.5:41234", "", "", "172.18.0.5:41234"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var got string
			h := trustedRealIP(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
				got = r.RemoteAddr
			}))
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.RemoteAddr = c.remote
			if c.xff != "" {
				req.Header.Set("X-Forwarded-For", c.xff)
			}
			if c.xreal != "" {
				req.Header.Set("X-Real-IP", c.xreal)
			}
			h.ServeHTTP(httptest.NewRecorder(), req)
			if got != c.want {
				t.Fatalf("RemoteAddr = %q, want %q", got, c.want)
			}
		})
	}
}
