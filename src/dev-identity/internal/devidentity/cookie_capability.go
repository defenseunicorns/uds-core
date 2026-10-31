// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
)

// Report the actual development-provider capability. This document never reads
// or writes cookies and cannot disclose a user's session to an embedding page.
func unsupportedCookieCheck(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		writer.Header().Set("Allow", "GET, HEAD")
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	const script = "window.parent.postMessage('unsupported', '*');"
	digest := sha256.Sum256([]byte(script))
	writer.Header().Set("Content-Type", "text/html; charset=utf-8")
	writer.Header().Set("Cache-Control", "public, max-age=300")
	writer.Header().Set("X-Content-Type-Options", "nosniff")
	writer.Header().Set("Content-Security-Policy", "default-src 'none'; script-src 'sha256-"+base64.StdEncoding.EncodeToString(digest[:])+"'; base-uri 'none'")
	if request.Method == http.MethodHead {
		return
	}
	fmt.Fprint(writer, "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Identity cookie capability</title></head><body><script>"+script+"</script></body></html>")
}
