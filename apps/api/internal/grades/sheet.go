// Package grades pulls student scores from public Google Sheets.
package grades

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Tab is one sheet of a spreadsheet.
type Tab struct {
	Name string
	GID  string
}

// Fetcher downloads spreadsheets published "to anyone with the link".
type Fetcher struct {
	Client *http.Client
	// BaseURL is https://docs.google.com; tests point it at a fake server.
	BaseURL string
}

// NewFetcher returns a fetcher for docs.google.com.
func NewFetcher() *Fetcher {
	return &Fetcher{Client: &http.Client{Timeout: 30 * time.Second}, BaseURL: "https://docs.google.com"}
}

// The HTML view lists tabs as items.push({name: "M3101", pageUrl: "...", gid: "770184490", ...}).
var tabRe = regexp.MustCompile(`items\.push\(\{name: "((?:[^"\\]|\\.)*)", pageUrl: "(?:[^"\\]|\\.)*", gid: "(-?\d+)"`)

// Tabs lists the sheets of a spreadsheet. A one-sheet document may have no
// tab list: then the first sheet (gid 0) is returned with an empty name.
func (f *Fetcher) Tabs(ctx context.Context, spreadsheetID string) ([]Tab, error) {
	body, err := f.get(ctx, "/spreadsheets/d/"+url.PathEscape(spreadsheetID)+"/htmlview")
	if err != nil {
		return nil, err
	}
	tabs := ParseTabs(string(body))
	if len(tabs) == 0 {
		tabs = []Tab{{GID: "0"}}
	}
	return tabs, nil
}

// ParseTabs extracts the tab list from the spreadsheet's HTML view.
func ParseTabs(html string) []Tab {
	var tabs []Tab
	for _, m := range tabRe.FindAllStringSubmatch(html, -1) {
		name, err := strconv.Unquote(`"` + m[1] + `"`)
		if err != nil {
			name = m[1]
		}
		tabs = append(tabs, Tab{Name: strings.TrimSpace(name), GID: m[2]})
	}
	return tabs
}

// CSV downloads one tab.
func (f *Fetcher) CSV(ctx context.Context, spreadsheetID, gid string) ([][]string, error) {
	body, err := f.get(ctx, "/spreadsheets/d/"+url.PathEscape(spreadsheetID)+"/export?format=csv&gid="+url.QueryEscape(gid))
	if err != nil {
		return nil, err
	}
	r := csv.NewReader(strings.NewReader(string(body)))
	r.FieldsPerRecord = -1
	r.LazyQuotes = true
	return r.ReadAll()
}

// ErrNotPublic means Google asked to sign in: the sheet is not shared by link.
var ErrNotPublic = errors.New("таблица не открыта по ссылке")

func (f *Fetcher) get(ctx context.Context, path string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, f.BaseURL+path, nil)
	if err != nil {
		return nil, err
	}
	resp, err := f.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden ||
		strings.Contains(resp.Request.URL.Host, "accounts.google.com") {
		return nil, ErrNotPublic
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google ответил %d", resp.StatusCode)
	}
	// Таблица на курс — сотни строк; 10 МБ хватит с запасом.
	return io.ReadAll(io.LimitReader(resp.Body, 10<<20))
}
