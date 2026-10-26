package cpplint

import (
	"encoding/xml"
	"fmt"
	"slices"
	"sort"
	"strings"
	"unicode/utf16"
	"unicode/utf8"

	"go.yaml.in/yaml/v3"
)

// offsets converts byte offsets in the source into editor positions.
type offsets struct {
	code   string
	starts []int // byte offset of each line start
}

func newOffsets(code string) offsets {
	starts := []int{0}
	for i := 0; i < len(code); i++ {
		if code[i] == '\n' {
			starts = append(starts, i+1)
		}
	}
	return offsets{code: code, starts: starts}
}

// pos returns the 1-based line and UTF-16 column of a byte offset.
func (o offsets) pos(off int) (line, col int) {
	off = min(max(off, 0), len(o.code))
	i := sort.Search(len(o.starts), func(i int) bool { return o.starts[i] > off }) - 1
	col = 1
	for _, r := range o.code[o.starts[i]:off] {
		if r == utf8.RuneError {
			col++
			continue
		}
		col += utf16.RuneLen(r)
	}
	return i + 1, col
}

// lineEnd returns the byte offset of the end of the 1-based line, without '\n'.
func (o offsets) lineEnd(line int) int {
	if line < len(o.starts) {
		return o.starts[line] - 1
	}
	return len(o.code)
}

type tidyExport struct {
	Diagnostics []struct {
		DiagnosticName    string        `yaml:"DiagnosticName"`
		DiagnosticMessage tidyMessage   `yaml:"DiagnosticMessage"`
		Notes             []tidyMessage `yaml:"Notes"`
		Level             string        `yaml:"Level"`
	} `yaml:"Diagnostics"`
}

type tidyMessage struct {
	Message      string `yaml:"Message"`
	FilePath     string `yaml:"FilePath"`
	FileOffset   int    `yaml:"FileOffset"`
	Replacements []struct {
		FilePath        string `yaml:"FilePath"`
		Offset          int    `yaml:"Offset"`
		Length          int    `yaml:"Length"`
		ReplacementText string `yaml:"ReplacementText"`
	} `yaml:"Replacements"`
	Ranges []struct {
		FilePath   string `yaml:"FilePath"`
		FileOffset int    `yaml:"FileOffset"`
		Length     int    `yaml:"Length"`
	} `yaml:"Ranges"`
}

// parseTidy reads clang-tidy --export-fixes output, keeping diagnostics and
// notes located in the checked file only: messages about system headers are
// of no use, and other files must never be quoted back.
func parseTidy(data []byte, src []string, idx offsets) ([]Diagnostic, error) {
	if len(data) == 0 {
		return nil, nil
	}
	var exp tidyExport
	if err := yaml.Unmarshal(data, &exp); err != nil {
		return nil, fmt.Errorf("clang-tidy fixes: %w", err)
	}
	var out []Diagnostic
	for _, d := range exp.Diagnostics {
		severity := "warning"
		if strings.EqualFold(d.Level, "Error") {
			severity = "error"
		}
		check := d.DiagnosticName
		if check == "clang-diagnostic-error" {
			check = ""
		}
		if m := d.DiagnosticMessage; slices.Contains(src, m.FilePath) {
			out = append(out, tidyDiagnostic(m, src, idx, severity, check))
		}
		for _, n := range d.Notes {
			if slices.Contains(src, n.FilePath) {
				out = append(out, tidyDiagnostic(n, src, idx, "info", check))
			}
		}
	}
	return out, nil
}

func tidyDiagnostic(m tidyMessage, src []string, idx offsets, severity, check string) Diagnostic {
	end := m.FileOffset
	for _, r := range m.Ranges {
		if slices.Contains(src, r.FilePath) && r.FileOffset <= m.FileOffset && r.FileOffset+r.Length > end {
			end = r.FileOffset + r.Length
		}
	}
	fixes := []Edit{}
	for _, r := range m.Replacements {
		if !slices.Contains(src, r.FilePath) {
			continue
		}
		if r.Offset == m.FileOffset && r.Offset+r.Length > end {
			end = r.Offset + r.Length
		}
		fixes = append(fixes, edit(idx, r.Offset, r.Offset+r.Length, r.ReplacementText))
	}
	d := Diagnostic{Severity: severity, Message: m.Message, Check: check, Fixes: fixes}
	d.Line, d.Column = idx.pos(m.FileOffset)
	d.EndLine, d.EndColumn = idx.pos(end)
	return d
}

func edit(idx offsets, from, to int, text string) Edit {
	e := Edit{Text: text}
	e.Line, e.Column = idx.pos(from)
	e.EndLine, e.EndColumn = idx.pos(to)
	return e
}

type formatReplacements struct {
	Items []struct {
		Offset int `xml:"offset,attr"`
		Length int `xml:"length,attr"`
	} `xml:"replacement"`
}

// parseFormat turns clang-format replacements into one diagnostic per line
// that clang-format would change.
func parseFormat(data string, idx offsets) ([]Diagnostic, error) {
	var reps formatReplacements
	if err := xml.Unmarshal([]byte(data), &reps); err != nil {
		return nil, fmt.Errorf("clang-format replacements: %w", err)
	}
	seen := map[int]bool{}
	var out []Diagnostic
	for _, r := range reps.Items {
		from, _ := idx.pos(r.Offset)
		to, _ := idx.pos(r.Offset + r.Length)
		for line := from; line <= to; line++ {
			if seen[line] {
				continue
			}
			seen[line] = true
			endLine, endCol := idx.pos(idx.lineEnd(line))
			out = append(out, Diagnostic{
				Line: line, Column: 1, EndLine: endLine, EndColumn: endCol,
				Severity: "info",
				Message:  "Строка оформлена не по Google Style: сравните с вкладкой clang-format",
				Check:    "clang-format",
				Fixes:    []Edit{},
			})
		}
	}
	return out, nil
}

func sortDiagnostics(d []Diagnostic) []Diagnostic {
	if d == nil {
		return []Diagnostic{}
	}
	sort.SliceStable(d, func(i, j int) bool {
		if d[i].Line != d[j].Line {
			return d[i].Line < d[j].Line
		}
		return d[i].Column < d[j].Column
	})
	return d
}
