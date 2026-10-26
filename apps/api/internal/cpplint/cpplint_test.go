package cpplint

import (
	"context"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCheckIncludes(t *testing.T) {
	ok := []string{
		"#include <iostream>\n#include <bits/stdc++.h>\n",
		"  #  include \"solution.h\"\n",
		"// #include \"/etc/passwd\" в комментарии не проверяем\nint x;",
	}
	for _, code := range ok {
		if err := CheckIncludes(code); err != nil {
			t.Errorf("CheckIncludes(%q) = %v", code, err)
		}
	}
	bad := map[string]int{
		"#include \"/etc/passwd\"":              1,
		"int x;\n#include </proc/self/environ>": 2,
		"#include \"../secret\"":                1,
		"#define F <x>\n#include F":             2,
		"%:include \"/etc/passwd\"":             1,
		"#inc\\\nlude \"/etc/passwd\"":          1,
		"\n#embed \"data.bin\"":                 2,
		"#include_next </etc/hosts>":            1,
	}
	for code, line := range bad {
		var inc *IncludeError
		if err := CheckIncludes(code); !errors.As(err, &inc) || inc.Line != line {
			t.Errorf("CheckIncludes(%q) = %v, want line %d", code, err, line)
		}
	}
}

func TestOffsetsUTF16(t *testing.T) {
	idx := newOffsets("ab\n// ё😀x\n")
	line, col := idx.pos(strings.Index(idx.code, "x"))
	// «ё» — один UTF-16 символ, эмодзи — два.
	if line != 2 || col != 7 {
		t.Fatalf("pos = %d:%d, want 2:7", line, col)
	}
}

func checker(t *testing.T) *Checker {
	t.Helper()
	c, err := Find(1)
	if err != nil {
		t.Skipf("clang tools not found: %v", err)
	}
	return c
}

func TestCheck(t *testing.T) {
	c := checker(t)
	code := "#include <vector>\n" +
		"class myClass {\n public:\n  int Get() const { return value_; }\n\n private:\n  int value_ = 0;\n};\n" +
		"int main(){ int* p = NULL; std::vector<int> v; return v.size() + (p != nullptr); }\n"
	res, err := c.Check(t.Context(), code)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(res.Formatted, "int main() {") {
		t.Errorf("formatted = %q", res.Formatted)
	}
	byCheck := map[string]Diagnostic{}
	for _, d := range res.Diagnostics {
		byCheck[d.Check] = d
	}
	naming, ok := byCheck["readability-identifier-naming"]
	if !ok || naming.Line != 2 || naming.Column != 7 || naming.EndColumn != 14 {
		t.Errorf("naming = %+v", naming)
	}
	if len(naming.Fixes) == 0 || naming.Fixes[0].Text != "MyClass" {
		t.Errorf("naming fixes = %+v", naming.Fixes)
	}
	if d, ok := byCheck["modernize-use-nullptr"]; !ok || d.Line != 9 {
		t.Errorf("nullptr = %+v", d)
	}
	if d, ok := byCheck["clang-format"]; !ok || d.Line != 9 || d.Severity != "info" {
		t.Errorf("clang-format = %+v", d)
	}
	if !strings.HasPrefix(res.Version, "LLVM version") {
		t.Errorf("version = %q", res.Version)
	}
}

func TestCheckCompileError(t *testing.T) {
	c := checker(t)
	res, err := c.Check(t.Context(), "int main() {\n  return undefined_name;\n}\n")
	if err != nil {
		t.Fatal(err)
	}
	for _, d := range res.Diagnostics {
		if d.Severity == "error" && d.Line == 2 && d.Column == 10 && d.Check == "" {
			return
		}
	}
	t.Fatalf("no compile error in %+v", res.Diagnostics)
}

func TestClientServer(t *testing.T) {
	c := checker(t)
	srv := httptest.NewServer(Server(c))
	defer srv.Close()
	client := NewClient(srv.URL)

	res, err := client.Check(t.Context(), "int main() { return 0; }\n")
	if err != nil || res.Formatted == "" {
		t.Fatalf("Check = %+v, %v", res, err)
	}
	_, err = client.Check(context.Background(), "#include \"/etc/passwd\"\n")
	f, ok := AsFailure(err)
	if !ok || f.Code != "forbidden_include" || f.Status != 422 {
		t.Fatalf("include: %v", err)
	}
}
