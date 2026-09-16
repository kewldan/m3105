// Package revalidate tells the Next.js app that public content changed, so it
// drops the cached API responses с соответствующими тегами. Вызов
// fire-and-forget: если фронт не ответил, контент всё равно обновится по TTL.
package revalidate

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// Notifier posts cache tags to the web app.
type Notifier struct {
	url   string
	token string
	hc    *http.Client
	log   *slog.Logger
}

// New builds a notifier; returns nil when the web URL or token is not configured.
func New(webURL, token string) *Notifier {
	webURL = strings.TrimRight(webURL, "/")
	if webURL == "" || token == "" {
		return nil
	}
	return &Notifier{
		url:   webURL + "/api/revalidate",
		token: token,
		hc:    &http.Client{Timeout: 5 * time.Second},
		log:   slog.Default().With("component", "revalidate"),
	}
}

// Tags asks the web app to drop the cached responses for these tags.
// Возвращается сразу: запрос уходит в фоне и не задерживает ответ админке.
func (n *Notifier) Tags(tags ...string) {
	if n == nil || len(tags) == 0 {
		return
	}
	go n.send(tags)
}

func (n *Notifier) send(tags []string) {
	body, err := json.Marshal(map[string][]string{"tags": tags})
	if err != nil {
		n.log.Warn("marshal", "err", err)
		return
	}
	// Свой контекст: запрос переживает ответ админке.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, n.url, bytes.NewReader(body))
	if err != nil {
		n.log.Warn("request", "err", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+n.token)
	res, err := n.hc.Do(req)
	if err != nil {
		n.log.Warn("send", "tags", tags, "err", err)
		return
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		n.log.Warn("rejected", "tags", tags, "status", res.StatusCode)
		return
	}
	n.log.Debug("cache dropped", "tags", tags)
}
