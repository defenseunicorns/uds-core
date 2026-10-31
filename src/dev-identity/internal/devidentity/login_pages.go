// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	_ "embed"
	"html/template"
	"net/http"
)

const loginCSP = "default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
const loginStylesPath = "/assets/uds-identity.css"

//go:embed login.html
var loginHTML string

//go:embed login.css
var loginCSS []byte

var loginPages = template.Must(template.New("identity").Parse(loginHTML))

type loginPage struct {
	CSRF, Return, Username, Error string
}

func identityPageHeaders(writer http.ResponseWriter) {
	writer.Header().Set("Content-Type", "text/html; charset=utf-8")
	writer.Header().Set("Cache-Control", "no-store")
	writer.Header().Set("Content-Security-Policy", loginCSP)
	writer.Header().Set("X-Content-Type-Options", "nosniff")
}

func renderIdentityPage(writer http.ResponseWriter, status int, name string, data any) {
	identityPageHeaders(writer)
	writer.WriteHeader(status)
	_ = loginPages.ExecuteTemplate(writer, name, data)
}

func serveLoginStyles(writer http.ResponseWriter, request *http.Request) bool {
	if request.URL.Path != loginStylesPath {
		return false
	}
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		writer.Header().Set("Allow", "GET, HEAD")
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return true
	}
	writer.Header().Set("Content-Type", "text/css; charset=utf-8")
	writer.Header().Set("Cache-Control", "public, max-age=300")
	writer.Header().Set("X-Content-Type-Options", "nosniff")
	if request.Method == http.MethodGet {
		_, _ = writer.Write(loginCSS)
	}
	return true
}
