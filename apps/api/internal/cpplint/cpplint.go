// Package cpplint checks a C++ source file against the Google C++ Style
// Guide with clang-format and clang-tidy.
//
// The tools parse arbitrary user code, and their diagnostics quote the lines
// they complain about, so `#include "/proc/self/environ"` would print the
// process environment. Includes are restricted here, but the real boundary is
// the process: in production the checker runs in its own container without
// secrets (cmd/cpplint), and the API talks to it through Client.
package cpplint

import (
	"bytes"
	"context"
	_ "embed"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// MaxCodeBytes bounds the size of a checked file.
const MaxCodeBytes = 64 << 10

//go:embed google.clang-tidy
var tidyConfig []byte

// Errors returned by Check; their codes travel between Server and Client.
var (
	ErrEmpty    = errors.New("cpplint: empty code")
	ErrTooLarge = errors.New("cpplint: code too large")
	ErrBusy     = errors.New("cpplint: too many checks in progress")
	ErrTimeout  = errors.New("cpplint: check timed out")
)

// IncludeError rejects an include the sandbox does not allow.
type IncludeError struct {
	Line int
	Text string
}

func (e *IncludeError) Error() string {
	return fmt.Sprintf("cpplint: forbidden include on line %d: %s", e.Line, e.Text)
}

// Service checks code; *Checker runs the tools locally, *Client asks a remote Server.
type Service interface {
	Check(ctx context.Context, code string) (Result, error)
}

// Result is the outcome of one check.
type Result struct {
	// Formatted is the code after clang-format --style=Google.
	Formatted   string       `json:"formatted"`
	Diagnostics []Diagnostic `json:"diagnostics"`
	// Version is the clang-tidy version line, e.g. "LLVM version 19.1.7".
	Version string `json:"version"`
}

// Diagnostic is one finding. Lines and columns are 1-based; columns count
// UTF-16 code units, as the browser editor does.
type Diagnostic struct {
	Line      int    `json:"line"`
	Column    int    `json:"column"`
	EndLine   int    `json:"endLine"`
	EndColumn int    `json:"endColumn"`
	Severity  string `json:"severity"` // error | warning | info
	Message   string `json:"message"`
	// Check is the clang-tidy check name or "clang-format".
	Check string `json:"check"`
	// Fixes is the fix clang-tidy suggests, empty when there is none.
	Fixes []Edit `json:"fixes"`
}

// Edit replaces the range with Text.
type Edit struct {
	Line      int    `json:"line"`
	Column    int    `json:"column"`
	EndLine   int    `json:"endLine"`
	EndColumn int    `json:"endColumn"`
	Text      string `json:"text"`
}

// Checker runs clang-format and clang-tidy binaries.
type Checker struct {
	format, tidy string
	version      string
	slots        chan struct{}
	// Timeout bounds one run of each tool.
	Timeout time.Duration
	// Wait is how long a check waits for a free slot before ErrBusy.
	Wait time.Duration
}

// New returns a checker that runs at most parallel checks at once.
func New(clangFormat, clangTidy string, parallel int) (*Checker, error) {
	if parallel < 1 {
		parallel = 1
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, clangTidy, "--version").Output()
	if err != nil {
		return nil, fmt.Errorf("cpplint: %s --version: %w", clangTidy, err)
	}
	if _, err := exec.LookPath(clangFormat); err != nil {
		return nil, fmt.Errorf("cpplint: %w", err)
	}
	return &Checker{
		format:  clangFormat,
		tidy:    clangTidy,
		version: parseVersion(string(out)),
		slots:   make(chan struct{}, parallel),
		Timeout: 15 * time.Second,
		Wait:    10 * time.Second,
	}, nil
}

// Find locates the tools via CLANG_FORMAT and CLANG_TIDY, then PATH, then
// Homebrew's keg-only LLVM.
func Find(parallel int) (*Checker, error) {
	return New(findTool("CLANG_FORMAT", "clang-format"), findTool("CLANG_TIDY", "clang-tidy"), parallel)
}

func findTool(env, name string) string {
	if p := os.Getenv(env); p != "" {
		return p
	}
	if p, err := exec.LookPath(name); err == nil {
		return p
	}
	for _, dir := range []string{"/opt/homebrew/opt/llvm/bin", "/usr/local/opt/llvm/bin"} {
		p := filepath.Join(dir, name)
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return name
}

var versionRe = regexp.MustCompile(`LLVM version [0-9][0-9.]*`)

func parseVersion(out string) string {
	if v := versionRe.FindString(out); v != "" {
		return v
	}
	return strings.TrimSpace(out)
}

// Check formats and lints code as a single file main.cc compiled with -std=c++20.
func (c *Checker) Check(ctx context.Context, code string) (Result, error) {
	if strings.TrimSpace(code) == "" {
		return Result{}, ErrEmpty
	}
	if len(code) > MaxCodeBytes {
		return Result{}, ErrTooLarge
	}
	if err := CheckIncludes(code); err != nil {
		return Result{}, err
	}

	wait, cancel := context.WithTimeout(ctx, c.Wait)
	defer cancel()
	select {
	case c.slots <- struct{}{}:
		defer func() { <-c.slots }()
	case <-wait.Done():
		if ctx.Err() != nil {
			return Result{}, ctx.Err()
		}
		return Result{}, ErrBusy
	}

	dir, err := os.MkdirTemp("", "cpplint-")
	if err != nil {
		return Result{}, err
	}
	defer os.RemoveAll(dir)
	src := filepath.Join(dir, "main.cc")
	cfg := filepath.Join(dir, "clang-tidy.yaml")
	fixes := filepath.Join(dir, "fixes.yaml")
	if err := os.WriteFile(src, []byte(code), 0o600); err != nil {
		return Result{}, err
	}
	if err := os.WriteFile(cfg, tidyConfig, 0o600); err != nil {
		return Result{}, err
	}

	formatted, err := c.run(ctx, dir, code, c.format, "--style=Google", "--assume-filename=main.cc")
	if err != nil {
		return Result{}, fmt.Errorf("clang-format: %w", err)
	}
	replacements, err := c.run(ctx, dir, code, c.format, "--style=Google", "--assume-filename=main.cc", "--output-replacements-xml")
	if err != nil {
		return Result{}, fmt.Errorf("clang-format: %w", err)
	}
	// clang-tidy выходит с ненулевым кодом, если в коде есть ошибки компиляции:
	// это нормальный результат, замечания всё равно лежат в fixes.yaml.
	_, err = c.run(ctx, dir, "", c.tidy, "--config-file="+cfg, "--export-fixes="+fixes, "--quiet", src,
		"--", "-std=c++20", "-xc++", "-Wall", "-Wextra")
	var exit *exec.ExitError
	if err != nil && !errors.As(err, &exit) {
		return Result{}, fmt.Errorf("clang-tidy: %w", err)
	}
	export, err := os.ReadFile(fixes)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return Result{}, err
	}

	idx := newOffsets(code)
	// clang-tidy пишет путь как есть, но на macOS временный каталог — симлинк.
	paths := []string{src}
	if real, err := filepath.EvalSymlinks(src); err == nil && real != src {
		paths = append(paths, real)
	}
	diags, err := parseTidy(export, paths, idx)
	if err != nil {
		return Result{}, err
	}
	formatDiags, err := parseFormat(replacements, idx)
	if err != nil {
		return Result{}, err
	}
	return Result{
		Formatted:   formatted,
		Diagnostics: sortDiagnostics(append(diags, formatDiags...)),
		Version:     c.version,
	}, nil
}

// run executes a tool in dir with stdin and returns its stdout.
func (c *Checker) run(ctx context.Context, dir, stdin, bin string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, c.Timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Dir = dir
	// Окружение не наследуется: инструментам оно не нужно.
	cmd.Env = []string{"HOME=" + dir, "PATH=/usr/bin:/bin", "LANG=C.UTF-8"}
	cmd.Stdin = strings.NewReader(stdin)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if ctx.Err() == context.DeadlineExceeded {
		return "", ErrTimeout
	}
	if err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			return stdout.String(), err
		}
		return "", err
	}
	return stdout.String(), nil
}

// includeRe matches preprocessor lines that read other files. `%:` is the
// digraph for `#`.
var includeRe = regexp.MustCompile(`^\s*(?:#|%:)\s*(include|include_next|import|embed)\b\s*(.*)$`)

// headerRe is an include target the sandbox allows: <name> or "name" with a
// relative path that does not climb up.
var headerRe = regexp.MustCompile(`^(<[A-Za-z0-9_+./-]+>|"[A-Za-z0-9_+./-]+")`)

// CheckIncludes rejects includes that could read files outside the system
// headers: absolute paths, `..`, macro-expanded names and #embed.
func CheckIncludes(code string) error {
	// Склейка строк через «\» в конце: так директиву можно разорвать на несколько строк.
	joined := strings.ReplaceAll(strings.ReplaceAll(code, "\r\n", "\n"), "\\\n", "")
	lineOf := lineMapper(code)
	pos := 0
	for line := range strings.SplitSeq(joined, "\n") {
		start := pos
		pos += len(line) + 1
		m := includeRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		target := strings.TrimSpace(m[2])
		bad := m[1] == "embed" || !headerRe.MatchString(target)
		if !bad {
			name := target[1 : strings.IndexAny(target[1:], `>"`)+1]
			bad = strings.HasPrefix(name, "/") || strings.Contains(name, "..")
		}
		if bad {
			return &IncludeError{Line: lineOf(start), Text: strings.TrimSpace(line)}
		}
	}
	return nil
}

// lineMapper maps an offset in code with line continuations removed back to
// a 1-based line of the original code.
func lineMapper(code string) func(int) int {
	code = strings.ReplaceAll(code, "\r\n", "\n")
	var lines []int // строка оригинала для каждого байта склеенного текста
	line := 1
	for i := 0; i < len(code); i++ {
		if code[i] == '\\' && i+1 < len(code) && code[i+1] == '\n' {
			i++
			line++
			continue
		}
		lines = append(lines, line)
		if code[i] == '\n' {
			line++
		}
	}
	return func(off int) int {
		if off < len(lines) {
			return lines[off]
		}
		return line
	}
}
