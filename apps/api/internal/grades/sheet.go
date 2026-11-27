// Package grades pulls student scores from public Google Sheets.
package grades

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"html"
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

// Tabs lists the sheets of a spreadsheet and returns its title. A one-sheet
// document may have no tab list: then the first sheet (gid 0) is returned
// with an empty name.
func (f *Fetcher) Tabs(ctx context.Context, spreadsheetID string) (tabs []Tab, title string, err error) {
	body, err := f.get(ctx, "/spreadsheets/d/"+url.PathEscape(spreadsheetID)+"/htmlview")
	if err != nil {
		return nil, "", err
	}
	tabs = ParseTabs(string(body))
	if len(tabs) == 0 {
		tabs = []Tab{{GID: "0"}}
	}
	return tabs, ParseTitle(string(body)), nil
}

var titleRe = regexp.MustCompile(`(?s)<title>(.*?)</title>`)

// ParseTitle returns the spreadsheet title from its HTML view, without the
// « - Google Drive» tail.
func ParseTitle(page string) string {
	m := titleRe.FindStringSubmatch(page)
	if m == nil {
		return ""
	}
	t := strings.TrimSpace(html.UnescapeString(m[1]))
	if i := strings.LastIndex(t, " - "); i > 0 && strings.HasPrefix(t[i+3:], "Google") {
		t = t[:i]
	}
	return strings.TrimSpace(t)
}

var groupInTextRe = regexp.MustCompile(`(?:^|[^\p{L}\d])([MМ]\d{4,5})(?:[^\p{L}\d]|$)`)

// TabGroup is the group of the rows of a tab that has neither a group column
// nor section rows: the tab name when it is a group code, else the one group
// code in the spreadsheet title («M3104. Алгебра» with a single «Sheet1»
// tab), else the tab name as it is.
func TabGroup(tabName, title string) string {
	if groupRowRe.MatchString(strings.ToUpper(strings.TrimSpace(tabName))) {
		return tabName
	}
	m := groupInTextRe.FindAllStringSubmatch(strings.ToUpper(title), -1)
	if len(m) == 1 {
		return m[0][1]
	}
	return tabName
}

// ParseTabs extracts the tab list from the spreadsheet's HTML view.
func ParseTabs(page string) []Tab {
	var tabs []Tab
	for _, m := range tabRe.FindAllStringSubmatch(page, -1) {
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
