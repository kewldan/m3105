package api

import (
	_ "embed"
	"net/http"
)

// openapiSpec is the public API description served at /api/v1/openapi.yaml.
//
//go:embed openapi.yaml
var openapiSpec []byte

// docsHTML renders the spec with Scalar; the script is the only external asset.
const docsHTML = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>М3105 API</title>
</head>
<body>
  <div id="app"></div>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  <script>
    Scalar.createApiReference('#app', { url: './openapi.yaml', hideModels: false, theme: 'default' })
  </script>
</body>
</html>`

func (h *Handler) getOpenAPI(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(openapiSpec)
}

func (h *Handler) getDocs(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(docsHTML))
}
