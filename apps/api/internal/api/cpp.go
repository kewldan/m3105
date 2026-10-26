package api

import (
	"net/http"

	"github.com/kewldan/edu3105/apps/api/internal/cpplint"
	"github.com/kewldan/edu3105/apps/api/internal/httpx"
)

// checkCpp runs clang-format and clang-tidy (Google C++ Style) over one file.
func (h *Handler) checkCpp(w http.ResponseWriter, r *http.Request) {
	if h.cpp == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "unavailable", "Проверка C++ сейчас недоступна")
		return
	}
	var req cpplint.Request
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	res, err := h.cpp.Check(r.Context(), req.Code)
	if err != nil {
		if f, ok := cpplint.AsFailure(err); ok {
			httpx.Error(w, f.Status, f.Code, f.Message)
			return
		}
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}
