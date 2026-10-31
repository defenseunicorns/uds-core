// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package main

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

func (p *lifecycleProbe) browserContract() error {
	for _, issuer := range []string{p.cfg.PublicOrigin, p.cfg.AdminOrigin} {
		for _, alias := range []string{"/token", "/protocol/openid-connect/token"} {
			for _, origin := range []string{"https://native-callback.invalid", "https://unapproved.invalid"} {
				form := url.Values{"grant_type": {"authorization_code"}, "code": {"invalid-review-code"}, "redirect_uri": {"https://native-callback.invalid/callback"}}
				request, err := http.NewRequest(http.MethodPost, issuer+"/realms/uds"+alias, strings.NewReader(form.Encode()))
				if err != nil {
					return err
				}
				request.SetBasicAuth(p.clientID, p.clientSecret)
				request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
				request.Header.Set("Origin", origin)
				response, err := p.client.Do(request)
				if err != nil {
					return err
				}
				_, _ = io.Copy(io.Discard, response.Body)
				response.Body.Close()
				if origin == "https://native-callback.invalid" {
					if response.StatusCode != 400 || response.Header.Get("Access-Control-Allow-Origin") != origin || response.Header.Get("Access-Control-Allow-Credentials") != "true" {
						return fmt.Errorf("credentialed token CORS contract failed on %s%s: %d", issuer, alias, response.StatusCode)
					}
				} else if response.StatusCode != 403 || response.Header.Get("Access-Control-Allow-Origin") != "" {
					return fmt.Errorf("unapproved token origin accepted on %s%s: %d", issuer, alias, response.StatusCode)
				}
			}
		}
		for _, alias := range []string{"/auth", "/protocol/openid-connect/auth"} {
			query := url.Values{"client_id": {p.clientID}, "response_type": {"code"}, "scope": {"openid"}, "redirect_uri": {"https://native-callback.invalid/unlisted"}}
			response, err := p.client.Get(issuer + "/realms/uds" + alias + "?" + query.Encode())
			if err != nil {
				return err
			}
			_, _ = io.Copy(io.Discard, response.Body)
			response.Body.Close()
			if response.StatusCode != 400 || response.Header.Get("Location") != "" {
				return fmt.Errorf("unlisted redirect reached login on %s%s: %d", issuer, alias, response.StatusCode)
			}
		}
	}
	fmt.Println("Both issuers enforce credentialed token origins and reject unlisted redirects before login")
	return nil
}
