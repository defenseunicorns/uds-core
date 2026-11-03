// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"encoding/json"
	"fmt"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/exemptions"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"net/http"
	"net/url"
	"sort"
	"strings"
)

// Check all namespaces before writer handoff. Pagination bounds each response.
func (c cluster) preflightExemptions() error {
	var failures []string
	continuation := ""
	for {
		path := "/apis/uds.dev/v1alpha1/exemptions?limit=500"
		if continuation != "" {
			path += "&continue=" + url.QueryEscape(continuation)
		}
		raw, err := c.request(http.MethodGet, path, nil, true)
		if err != nil {
			return fmt.Errorf("check Exemption RE2 migration: %w", err)
		}
		if len(raw) == 0 {
			break
		} // Fresh install has no Exemption API yet.
		var list unstructured.UnstructuredList
		if err := json.Unmarshal(raw, &list); err != nil {
			return err
		}
		for _, object := range list.Items {
			entries, _, err := unstructured.NestedSlice(object.Object, "spec", "exemptions")
			if err != nil {
				return fmt.Errorf("read Exemption %s/%s: %w", object.GetNamespace(), object.GetName(), err)
			}
			for index, rawEntry := range entries {
				entry, ok := rawEntry.(map[string]interface{})
				if !ok {
					return fmt.Errorf("malformed Exemption %s/%s matcher[%d]", object.GetNamespace(), object.GetName(), index)
				}
				pattern, _, err := unstructured.NestedString(entry, "matcher", "name")
				if err != nil {
					return err
				}
				if err := exemptions.ValidatePattern(pattern); err != nil {
					failures = append(failures, fmt.Sprintf("%s/%s matcher[%d] pattern %q: %s", object.GetNamespace(), object.GetName(), index, pattern, err))
				}
			}
		}
		continuation = list.GetContinue()
		if continuation == "" {
			break
		}
	}
	if len(failures) > 0 {
		sort.Strings(failures)
		return fmt.Errorf("Exemption patterns must use RE2 before upgrading; the existing operator has not been stopped:\n%s\nRepair these patterns and rerun; syntax: %s", strings.Join(failures, "\n"), exemptions.RE2Syntax)
	}
	return nil
}
