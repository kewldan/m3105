// Package students reads the course list the admin imports: a table copied
// from a page (tab-separated), a CSV, or the saved page itself (.html, .mht).
package students

import (
	"bytes"
	"html"
	"io"
	"mime/quotedprintable"
	"regexp"
	"strings"
	"unicode"

	"github.com/kewldan/edu3105/apps/api/internal/models"
)

var (
	rowRe   = regexp.MustCompile(`(?is)<tr\b[^>]*>(.*?)</tr>`)
	cellRe  = regexp.MustCompile(`(?is)<t[dh]\b[^>]*>(.*?)</t[dh]>`)
	tagRe   = regexp.MustCompile(`(?s)<[^>]*>`)
	isuRe   = regexp.MustCompile(`^\d{5,7}$`)
	groupRe = regexp.MustCompile(`^[MМ]\d{4,5}[а-яa-z]?$`)
)

// Parse extracts rows. A row needs an ISU number, a group like "M3105" and a
// name of at least two words, in any column order; header rows and lines with
// a single field are ignored, lines that have some of it count as skipped.
func Parse(text string) (rows []models.StudentInput, skipped int) {
	seen := map[string]int{}
	add := func(cells []string) {
		in, ok, partial := fromCells(cells)
		if !ok {
			if partial {
				skipped++
			}
			return
		}
		// A later row for the same number wins: a pasted list may repeat.
		if i, dup := seen[in.ISU]; dup {
			rows[i] = in
			return
		}
		seen[in.ISU] = len(rows)
		rows = append(rows, in)
	}
	if strings.Contains(strings.ToLower(text), "<tr") {
		for _, row := range rowRe.FindAllStringSubmatch(decodeMHT(text), -1) {
			var cells []string
			for _, c := range cellRe.FindAllStringSubmatch(row[1], -1) {
				cells = append(cells, html.UnescapeString(tagRe.ReplaceAllString(c[1], " ")))
			}
			add(cells)
		}
		return rows, skipped
	}
	for _, line := range strings.Split(text, "\n") {
		add(splitLine(line))
	}
	return rows, skipped
}

// fromCells picks the ISU, group and name columns. ok is false when one is missing;
// partial says the row had at least an ISU or a group, so it was meant as data.
func fromCells(cells []string) (in models.StudentInput, ok, partial bool) {
	for _, raw := range cells {
		c := strings.Join(strings.Fields(raw), " ")
		switch {
		case c == "":
		case in.ISU == "" && isuRe.MatchString(c):
			in.ISU = c
		case in.GroupName == "" && groupRe.MatchString(strings.ToUpper(strings.ReplaceAll(c, " ", ""))):
			in.GroupName = c
		case in.FullName == "" && isName(c):
			in.FullName = c
		}
	}
	partial = in.ISU != "" || in.GroupName != ""
	if in.ISU == "" || in.GroupName == "" || in.FullName == "" {
		return in, false, partial
	}
	return in, in.Validate() == nil, true
}

// isName is two or more words made of letters, hyphens and apostrophes.
func isName(s string) bool {
	words := strings.Fields(s)
	if len(words) < 2 {
		return false
	}
	for _, r := range s {
		if !unicode.IsLetter(r) && r != ' ' && r != '-' && r != '\'' && r != '’' {
			return false
		}
	}
	return true
}

func splitLine(line string) []string {
	line = strings.TrimRight(line, "\r")
	for _, sep := range []string{"\t", ";", ","} {
		if strings.Contains(line, sep) {
			return strings.Split(line, sep)
		}
	}
	return []string{line}
}

// decodeMHT undoes quoted-printable when a browser saved the page that way.
func decodeMHT(text string) string {
	if !strings.Contains(strings.ToLower(text), "quoted-printable") {
		return text
	}
	b, err := io.ReadAll(quotedprintable.NewReader(bytes.NewBufferString(text)))
	if err != nil && len(b) == 0 {
		return text
	}
	return string(b)
}
