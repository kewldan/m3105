// Package httpx contains small helpers for JSON request/response handling.
package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

// ErrorBody is the JSON shape of every error response.
type ErrorBody struct {
	Error  string            `json:"error"`
	Code   string            `json:"code"`
	Fields map[string]string `json:"fields,omitempty"`
}

// ValidationError carries per-field messages for a 422 response.
type ValidationError struct {
	Fields map[string]string
}

func (v *ValidationError) Error() string { return "validation failed" }

// NewValidation builds an empty validation error to be filled by callers.
func NewValidation() *ValidationError {
	return &ValidationError{Fields: map[string]string{}}
}

// Add records a field error.
func (v *ValidationError) Add(field, msg string) { v.Fields[field] = msg }

// Empty reports whether no field errors were recorded.
func (v *ValidationError) Empty() bool { return len(v.Fields) == 0 }

// JSON writes v as a JSON response with the given status.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("encode response", "err", err)
	}
}

// Error writes a structured error response.
func Error(w http.ResponseWriter, status int, code, msg string) {
	JSON(w, status, ErrorBody{Error: msg, Code: code})
}

// Fail maps well-known error types to HTTP responses.
func Fail(w http.ResponseWriter, err error) {
	var ve *ValidationError
	switch {
	case errors.As(err, &ve):
		JSON(w, http.StatusUnprocessableEntity, ErrorBody{Error: "Проверьте заполнение полей", Code: "validation", Fields: ve.Fields})
	case errors.Is(err, ErrNotFound):
		Error(w, http.StatusNotFound, "not_found", "Не найдено")
	case errors.Is(err, ErrConflict):
		Error(w, http.StatusConflict, "conflict", "Конфликт данных")
	default:
		slog.Error("request failed", "err", err)
		Error(w, http.StatusInternalServerError, "internal", "Внутренняя ошибка сервера")
	}
}

// Sentinel errors shared between the store and handlers.
var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("conflict")
)

// Decode reads a JSON body into v, limiting size to 4 MiB.
func Decode(r *http.Request, v any) error {
	body := http.MaxBytesReader(nil, r.Body, 4<<20)
	defer body.Close()
	dec := json.NewDecoder(body)
	if err := dec.Decode(v); err != nil {
		if errors.Is(err, io.EOF) {
			return &ValidationError{Fields: map[string]string{"_": "Пустое тело запроса"}}
		}
		return &ValidationError{Fields: map[string]string{"_": "Некорректный JSON: " + err.Error()}}
	}
	return nil
}

// IDParam parses the {id} route parameter.
func IDParam(r *http.Request) (int64, error) {
	raw := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id <= 0 {
		return 0, ErrNotFound
	}
	return id, nil
}
