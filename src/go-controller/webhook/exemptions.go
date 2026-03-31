// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"log/slog"
	"regexp"
	"sync"

	corev1 "k8s.io/api/core/v1"
)

// ExemptionMatcher matches pods by namespace (exact) and name (regex).
type ExemptionMatcher struct {
	Namespace string
	Name      *regexp.Regexp
	Owner     string
}

// ExemptionStore holds in-memory exemptions indexed by policy name.
type ExemptionStore struct {
	mu   sync.RWMutex
	data map[string][]ExemptionMatcher
}

// NewExemptionStore creates an empty exemption store.
func NewExemptionStore() *ExemptionStore {
	return &ExemptionStore{
		data: make(map[string][]ExemptionMatcher),
	}
}

// Set replaces all matchers for a given owner across all policies, then adds the new ones.
func (s *ExemptionStore) Set(owner string, entries []ExemptionEntry) {
	s.mu.Lock()
	defer s.mu.Unlock()

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
		nameRe, err := regexp.Compile(entry.Name)
		if err != nil {
			slog.Warn("Invalid exemption name regex, skipping", "pattern", entry.Name, "error", err)
			continue
		}
		for _, policy := range entry.Policies {
			s.data[policy] = append(s.data[policy], ExemptionMatcher{
				Namespace: entry.Namespace,
				Name:      nameRe,
				Owner:     owner,
			})
		}
	}
}

// Remove removes all matchers owned by the given owner.
func (s *ExemptionStore) Remove(owner string) {
	s.mu.Lock()
	defer s.mu.Unlock()

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
	s.mu.RLock()
	defer s.mu.RUnlock()

	matchers := s.data[policy]
	name := pod.Name
	if name == "" {
		name = pod.GenerateName
	}
	ns := pod.Namespace

	for _, m := range matchers {
		if m.Namespace != ns {
			continue
		}
		if m.Name.MatchString(name) {
			return true
		}
	}
	return false
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
