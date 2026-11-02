// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package admission

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	compiled "github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/exemptions"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"log/slog"
)

// Bound tenant-controlled annotation size; every problem still has an Event.
func invalidMatcherAnnotation(problems []compiled.InvalidMatcher) string {
	names := []string{}
	seen := map[string]bool{}
	size := 0
	for _, problem := range problems {
		name := problem.Namespace + "/" + problem.Name
		if seen[name] {
			continue
		}
		if size+len(name) > 16000 {
			names = append(names, "additional invalid matchers: see Exemption Warning Events")
			break
		}
		names = append(names, name)
		seen[name] = true
		size += len(name)
	}
	raw, _ := json.Marshal(names)
	return string(raw)
}
func (c *Compiler) reportInvalidMatchers(ctx context.Context, problems []compiled.InvalidMatcher) error {
	for _, problem := range problems {
		message := fmt.Sprintf("matcher[%d] pattern %q is not RE2 and was omitted: %s; syntax: %s", problem.Index, problem.Pattern, problem.Error, compiled.RE2Syntax)
		slog.Error("Invalid exemption matcher omitted", "namespace", problem.Namespace, "exemption", problem.Name, "matcher", problem.Index, "pattern", problem.Pattern, "error", problem.Error)
		// Stable per UID/index/pattern: retries and replica handoff do not flood Events.
		digest := sha256.Sum256([]byte(problem.UID + message))
		if len(message) > 3000 {
			message = message[:3000] + " (truncated)"
		}
		now := metav1.Now().UTC().Format("2006-01-02T15:04:05Z")
		event := &unstructured.Unstructured{Object: map[string]interface{}{
			"apiVersion": "v1", "kind": "Event",
			"metadata":       map[string]interface{}{"name": fmt.Sprintf("invalid-exemption-%x", digest[:16]), "namespace": problem.Namespace},
			"involvedObject": map[string]interface{}{"apiVersion": "uds.dev/v1alpha1", "kind": "Exemption", "name": problem.Name, "namespace": problem.Namespace, "uid": problem.UID},
			"type":           "Warning", "reason": "InvalidRE2Matcher", "message": message,
			"source":         map[string]interface{}{"component": "uds-controller"},
			"firstTimestamp": now, "lastTimestamp": now, "count": int64(1),
		}}
		_, err := c.client.Resource(schema.GroupVersionResource{Version: "v1", Resource: "events"}).Namespace(problem.Namespace).Create(ctx, event, metav1.CreateOptions{})
		if err != nil && !apierrors.IsAlreadyExists(err) {
			return fmt.Errorf("record invalid matcher: %w", err)
		}
	}
	return nil
}
