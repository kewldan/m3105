package api_test

import (
	"context"
	"strings"
	"testing"

	"github.com/kewldan/edu3105/apps/api/internal/cpplint"
)

// fakeCpp stands in for cmd/cpplint: the API only forwards code and errors.
type fakeCpp struct{}

func (fakeCpp) Check(_ context.Context, code string) (cpplint.Result, error) {
	if err := cpplint.CheckIncludes(code); err != nil {
		return cpplint.Result{}, err
	}
	if strings.TrimSpace(code) == "" {
		return cpplint.Result{}, cpplint.ErrEmpty
	}
	return cpplint.Result{
		Formatted: strings.TrimSpace(code) + "\n",
		Diagnostics: []cpplint.Diagnostic{{
			Line: 1, Column: 1, EndLine: 1, EndColumn: 4, Severity: "warning",
			Message: "use nullptr", Check: "modernize-use-nullptr",
			Fixes: []cpplint.Edit{{Line: 1, Column: 1, EndLine: 1, EndColumn: 4, Text: "nullptr"}},
		}},
		Version: "LLVM version 19.1.7",
	}, nil
}

func TestCppCheck(t *testing.T) {
	c := newClient(t)
	res := c.do("POST", "/api/v1/cpp/check", map[string]string{"code": "int x;  "}, 200)
	if res["formatted"] != "int x;\n" || res["version"] != "LLVM version 19.1.7" {
		t.Fatalf("result = %v", res)
	}
	spec := loadSpec(t)
	assertMatchesSchema(t, spec, "CppCheckResult", res)
	diags, _ := res["diagnostics"].([]any)
	if len(diags) != 1 || diags[0].(map[string]any)["check"] != "modernize-use-nullptr" {
		t.Fatalf("diagnostics = %v", res["diagnostics"])
	}
	diag := diags[0].(map[string]any)
	assertMatchesSchema(t, spec, "CppDiagnostic", diag)
	assertMatchesSchema(t, spec, "CppEdit", diag["fixes"].([]any)[0].(map[string]any))

	bad := c.do("POST", "/api/v1/cpp/check", map[string]string{"code": "#include \"/proc/self/environ\""}, 422)
	if bad["code"] != "forbidden_include" {
		t.Fatalf("include = %v", bad)
	}
	empty := c.do("POST", "/api/v1/cpp/check", map[string]string{"code": " "}, 422)
	if empty["code"] != "empty" {
		t.Fatalf("empty = %v", empty)
	}
}
