// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package main

import (
	"fmt"
	"html"
	"io"
	"net/http"
	"regexp"
	"strings"
)

// Follow the sign-in document's same-origin navigation, as a browser does.
// Ordinary HTTP redirects remain available for older probe deployments.
func completeLoginNavigation(client *http.Client, response *http.Response, origin string) (*http.Response, error) {
	if response.StatusCode != http.StatusOK || !strings.HasPrefix(response.Header.Get("Content-Type"), "text/html") {
		return response, nil
	}
	page, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	response.Body.Close()
	if err != nil {
		return nil, err
	}
	match := regexp.MustCompile(`<a id="continue" href="([^"]+)">`).FindSubmatch(page)
	if len(match) != 2 {
		return nil, fmt.Errorf("authenticated local navigation document missing")
	}
	target := html.UnescapeString(string(match[1]))
	if !strings.HasPrefix(target, "/") || strings.HasPrefix(target, "//") || strings.ContainsAny(target, "\\\r\n") {
		return nil, fmt.Errorf("untrusted login navigation target")
	}
	return client.Get(origin + target)
}
