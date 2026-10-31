// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"fmt"
	compiledexemptions "github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/exemptions"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/resources"
	"log/slog"
	"regexp"
	"sync"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// ExemptionMatcher matches pods by namespace (exact) and name (regex).
type ExemptionMatcher struct {
	Namespace     string
	Name          *regexp.Regexp
	LegacyPattern string
	Owner         string
}

// ExemptionStore holds in-memory exemptions indexed by policy name.
type ExemptionStore struct {
	mu       sync.RWMutex
	data     map[string][]ExemptionMatcher
	ready    bool
	revision string
}

// Replace atomically replaces a complete trusted informer snapshot. Invalid
// input revokes all grants instead of leaving an older authorization active.
func (s *ExemptionStore) Replace(objects []*unstructured.Unstructured, allowAll bool) error {
	parameters, err := compiledexemptions.Compile(objects, allowAll)
	replacement := NewExemptionStore()
	if err == nil {
		for _, object := range objects {
			owner, entries, parseErr := ParseExemptionEntries(object.Object)
			if parseErr != nil {
				err = parseErr
				break
			}
			if setErr := replacement.Set(owner, entries); setErr != nil {
				err = setErr
				break
			}
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err != nil {
		s.data = make(map[string][]ExemptionMatcher)
		s.ready = false
		s.revision = "invalid-input"
		return err
	}
	s.data = replacement.data
	s.ready = true
	s.revision = parameters.Revision
	return nil
}

func (s *ExemptionStore) Ready() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.ready
}

// NewExemptionStore creates an empty exemption store.
func NewExemptionStore() *ExemptionStore {
	return &ExemptionStore{
		data: make(map[string][]ExemptionMatcher),
	}
}

// Set replaces all matchers for a given owner across all policies, then adds the new ones.
func (s *ExemptionStore) Set(owner string, entries []ExemptionEntry) error {
	for _, entry := range entries {
		if err := compiledexemptions.ValidatePattern(entry.Name); err != nil {
			return fmt.Errorf("invalid exemption %s: %w", owner, err)
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.revision = "" // Only a validated complete Replace owns a compiled revision.

	// Remove old entries for this owner
	for policy, matchers := range s.data {
		filtered := make([]ExemptionMatcher, 0, len(matchers))
		for _, m := range matchers {
			if m.Owner != owner {
				filtered = append(filtered, m)
			}
		}
		s.data[policy] = filtered
	}

	// Add new entries
	for _, entry := range entries {
		var nameRe *regexp.Regexp
		legacyPattern := ""
		if compiledexemptions.IsNativePattern(entry.Name) {
			nameRe, _ = regexp.Compile(entry.Name)
		} else {
			legacyPattern = entry.Name
		}
		for _, policy := range entry.Policies {
			s.data[policy] = append(s.data[policy], ExemptionMatcher{
				Namespace:     entry.Namespace,
				Name:          nameRe,
				LegacyPattern: legacyPattern,
				Owner:         owner,
			})
		}
	}
	return nil
}

// Remove removes all matchers owned by the given owner.
func (s *ExemptionStore) Remove(owner string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.revision = ""

	for policy, matchers := range s.data {
		filtered := make([]ExemptionMatcher, 0, len(matchers))
		for _, m := range matchers {
			if m.Owner != owner {
				filtered = append(filtered, m)
			}
		}
		s.data[policy] = filtered
	}
}

// IsExempt checks if a pod is exempt from a given policy.
func (s *ExemptionStore) IsExempt(pod *corev1.Pod, policy string) bool {
	return s.IsResourceExempt(pod.Namespace, pod.Name, pod.GenerateName, policy)
}

func (s *ExemptionStore) IsResourceExempt(namespace, resourceName, generateName, policy string) bool {
	return s.Evaluator(namespace, resourceName, generateName)(policy)
}

// Evaluator pins one immutable grant snapshot for all policies in a request.
// Watch updates cannot combine permission from two different revisions.
func (s *ExemptionStore) Evaluator(namespace, resourceName, generateName string) func(string) bool {
	return s.evaluator(namespace, resourceName, generateName, resourceName != "" || generateName != "")
}

// Preserve Core's name || generateName selection, including absence versus an
// explicitly empty generateName. API metadata validation still owns validity.
func (s *ExemptionStore) MetadataEvaluator(metadata resources.Object) func(string) bool {
	return s.evaluator(metadata.String("namespace"), metadata.String("name"), metadata.String("generateName"), metadata.String("name") != "" || metadata.Has("generateName"))
}

// MetadataSnapshot pins the grant evaluator and its compiler revision together.
// Native mutation and Go fallback cannot silently combine different snapshots.
func (s *ExemptionStore) MetadataSnapshot(metadata resources.Object) (func(string) bool, string, bool) {
	return s.snapshotEvaluator(metadata.String("namespace"), metadata.String("name"), metadata.String("generateName"), metadata.String("name") != "" || metadata.Has("generateName"))
}

func (s *ExemptionStore) evaluator(namespace, resourceName, generateName string, present bool) func(string) bool {
	evaluate, _, _ := s.snapshotEvaluator(namespace, resourceName, generateName, present)
	return evaluate
}

func (s *ExemptionStore) snapshotEvaluator(namespace, resourceName, generateName string, present bool) (func(string) bool, string, bool) {
	s.mu.RLock()
	snapshot := make(map[string][]ExemptionMatcher, len(s.data))
	for policy, matchers := range s.data {
		snapshot[policy] = append([]ExemptionMatcher(nil), matchers...)
	}
	revision, ready := s.revision, s.ready
	s.mu.RUnlock()
	if !present {
		return func(string) bool { return false }, revision, ready
	}
	name := resourceName
	if name == "" {
		name = generateName
	}

	return func(policy string) bool {
		for _, m := range snapshot[policy] {
			if m.Namespace != namespace {
				continue
			}
			if m.Name != nil && m.Name.MatchString(name) {
				return true
			}
			if m.Name == nil {
				matched, err := compiledexemptions.MatchLegacy(m.LegacyPattern, name)
				if err != nil {
					slog.Error("Exemption evaluation failed", "owner", m.Owner, "error", err)
					continue
				}
				if matched {
					return true
				}
			}
		}
		return false
	}, revision, ready
}

// ExemptionEntry represents a parsed exemption from a UDSExemption CR.
type ExemptionEntry struct {
	Namespace string
	Name      string
	Policies  []string
}

// ParseExemptionEntries extracts ExemptionEntry items from an unstructured UDSExemption object.
func ParseExemptionEntries(obj map[string]interface{}) (string, []ExemptionEntry, error) {
	metadata, _ := obj["metadata"].(map[string]interface{})
	uid, _ := metadata["uid"].(string)

	spec, _ := obj["spec"].(map[string]interface{})
	if spec == nil {
		return uid, nil, nil
	}

	exemptionsList, _ := spec["exemptions"].([]interface{})
	var entries []ExemptionEntry

	for _, item := range exemptionsList {
		exemption, ok := item.(map[string]interface{})
		if !ok {
			continue
		}

		matcher, _ := exemption["matcher"].(map[string]interface{})
		if matcher == nil {
			continue
		}

		namespace, _ := matcher["namespace"].(string)
		name, _ := matcher["name"].(string)

		policiesRaw, _ := exemption["policies"].([]interface{})
		var policies []string
		for _, p := range policiesRaw {
			if s, ok := p.(string); ok {
				policies = append(policies, s)
			}
		}

		entries = append(entries, ExemptionEntry{
			Namespace: namespace,
			Name:      name,
			Policies:  policies,
		})
	}

	return uid, entries, nil
}
