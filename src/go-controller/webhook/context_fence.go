// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"bytes"
	"context"
	"net/http"
)

// Buffer the small admission response until the serving context is checked.
// Shutdown cannot return a successful decision from a stopped cache generation.
func fenceAdmissions(ctx context.Context, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if ctx.Err() != nil {
			http.Error(w, "Admission authority stopped", http.StatusServiceUnavailable)
			return
		}
		buffer := &fencedResponse{header: make(http.Header), status: http.StatusOK}
		next.ServeHTTP(buffer, r)
		if ctx.Err() != nil {
			http.Error(w, "Admission authority stopped", http.StatusServiceUnavailable)
			return
		}
		for key, values := range buffer.header {
			w.Header()[key] = values
		}
		w.WriteHeader(buffer.status)
		_, _ = w.Write(buffer.body.Bytes())
	})
}

type fencedResponse struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func (w *fencedResponse) Header() http.Header            { return w.header }
func (w *fencedResponse) WriteHeader(status int)         { w.status = status }
func (w *fencedResponse) Write(body []byte) (int, error) { return w.body.Write(body) }
