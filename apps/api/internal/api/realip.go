package api

import (
	"net"
	"net/http"
	"strings"
)

// trustedRealIP replaces RemoteAddr with the client IP from the proxy headers,
// но только если запрос пришёл из приватной сети, то есть от нашего nginx.
// Заголовкам из интернета верить нельзя: X-Forwarded-For подделывается одной
// строкой, а по этому IP считается лимит попыток входа (chi middleware.RealIP
// признан небезопасным ровно поэтому).
func trustedRealIP(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, port, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
		if err == nil && fromProxy(host) {
			if ip := headerIP(r); ip != "" {
				r.RemoteAddr = net.JoinHostPort(ip, port)
			}
		}
		next.ServeHTTP(w, r)
	})
}

// fromProxy reports whether the immediate peer is our own infrastructure.
func fromProxy(host string) bool {
	ip := net.ParseIP(host)
	return ip != nil && (ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast())
}

// headerIP returns the left-most valid address from X-Forwarded-For, or X-Real-IP.
func headerIP(r *http.Request) string {
	for value := range strings.SplitSeq(r.Header.Get("X-Forwarded-For"), ",") {
		if ip := strings.TrimSpace(value); net.ParseIP(ip) != nil {
			return ip
		}
	}
	if ip := strings.TrimSpace(r.Header.Get("X-Real-IP")); net.ParseIP(ip) != nil {
		return ip
	}
	return ""
}
