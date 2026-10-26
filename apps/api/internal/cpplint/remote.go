package cpplint

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// Request is the body of a check request, both for the API and for Server.
type Request struct {
	Code string `json:"code"`
}

// Failure is a rejected check, ready to be sent as `{ error, code }`.
type Failure struct {
	Status  int    `json:"-"`
	Code    string `json:"code"`
	Message string `json:"error"`
}

func (f *Failure) Error() string { return "cpplint: " + f.Code + ": " + f.Message }

// AsFailure maps an error of Check to a response; ok is false for internal errors.
func AsFailure(err error) (f *Failure, ok bool) {
	var inc *IncludeError
	switch {
	case errors.As(err, &f):
		return f, true
	case errors.Is(err, ErrEmpty):
		return &Failure{http.StatusUnprocessableEntity, "empty", "Вставьте код, который нужно проверить"}, true
	case errors.Is(err, ErrTooLarge):
		return &Failure{http.StatusRequestEntityTooLarge, "too_large",
			fmt.Sprintf("Код больше %d КБ — проверьте файл по частям", MaxCodeBytes>>10)}, true
	case errors.As(err, &inc):
		return &Failure{http.StatusUnprocessableEntity, "forbidden_include",
			fmt.Sprintf("Строка %d: подключать можно только стандартные заголовки, без абсолютных путей, «..» и #embed", inc.Line)}, true
	case errors.Is(err, ErrBusy):
		return &Failure{http.StatusServiceUnavailable, "busy", "Сейчас проверяется слишком много кода, попробуйте через пару секунд"}, true
	case errors.Is(err, ErrTimeout):
		return &Failure{http.StatusUnprocessableEntity, "timeout", "Проверка не уложилась во время — упростите код"}, true
	}
	return nil, false
}

// Server exposes a Service over HTTP: POST /check with Request, answer Result.
func Server(svc Service) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("POST /check", func(w http.ResponseWriter, r *http.Request) {
		var req Request
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2*MaxCodeBytes)).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, &Failure{Code: "bad_request", Message: "Некорректный JSON"})
			return
		}
		res, err := svc.Check(r.Context(), req.Code)
		if err != nil {
			if f, ok := AsFailure(err); ok {
				writeJSON(w, f.Status, f)
				return
			}
			slog.Error("cpp check", "err", err)
			writeJSON(w, http.StatusInternalServerError, &Failure{Code: "internal", Message: "Проверка не удалась"})
			return
		}
		writeJSON(w, http.StatusOK, res)
	})
	return mux
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("encode response", "err", err)
	}
}

// Client calls a remote Server.
type Client struct {
	URL  string
	HTTP *http.Client
}

// NewClient returns a client for the server at baseURL.
func NewClient(baseURL string) *Client {
	return &Client{URL: strings.TrimRight(baseURL, "/"), HTTP: &http.Client{Timeout: 45 * time.Second}}
}

// Check sends code to the server; rejections come back as *Failure.
func (c *Client) Check(ctx context.Context, code string) (Result, error) {
	body, err := json.Marshal(Request{Code: code})
	if err != nil {
		return Result{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.URL+"/check", bytes.NewReader(body))
	if err != nil {
		return Result{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return Result{}, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return Result{}, err
	}
	if resp.StatusCode != http.StatusOK {
		f := &Failure{Status: resp.StatusCode}
		if json.Unmarshal(data, f) != nil || f.Code == "" || (resp.StatusCode >= 500 && f.Code != "busy") {
			return Result{}, fmt.Errorf("cpplint server: %s", resp.Status)
		}
		return Result{}, f
	}
	var res Result
	if err := json.Unmarshal(data, &res); err != nil {
		return Result{}, fmt.Errorf("cpplint server: %w", err)
	}
	return res, nil
}
