// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package exemptions

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

const ProtectedNamespace = "uds-policy-exemptions"

var Policies = []string{
	"DisallowHostNamespaces", "RestrictHostPorts", "DisallowPrivileged",
	"RequireNonRootUser", "RestrictProcMount", "RestrictSeccomp",
	"DisallowSELinuxOptions", "RestrictSELinuxType", "DropAllCapabilities",
	"RestrictCapabilities", "RestrictVolumeTypes", "RestrictHostPathWrite",
	"RestrictIstioSidecarOverrides", "RestrictIstioTrafficOverrides",
	"RestrictIstioAmbientOverrides", "RestrictIstioUser",
	"RestrictExternalNames", "DisallowNodePortServices",
}

type Matcher struct {
	Policy    string `json:"policy"`
	Namespace string `json:"namespace"`
	Pattern   string `json:"pattern"`
	Owner     string `json:"owner"`
}

type LegacyScope struct {
	Policy    string `json:"policy"`
	Namespace string `json:"namespace"`
}

// One object contains the OR-union of grants. Multiple parameter objects must
// never turn this into the API server's AND-of-policy-evaluations semantics.
type Parameters struct {
	NativeMatchers     []Matcher     `json:"nativeMatchers"`
	LegacyScopes       []LegacyScope `json:"legacyScopes"`
	Revision           string        `json:"revision"`
	Valid              bool          `json:"valid"`
	AllowAllNamespaces bool          `json:"allowAllNamespaces"`
}

// Compile validates every input before replacing a complete snapshot. A
// supported JS-only expression delegates that policy/namespace to Go; it never
// disappears silently or gets reinterpreted as a different native regex.
func Compile(objects []*unstructured.Unstructured, allowAllNamespaces bool) (Parameters, error) {
	result := Parameters{NativeMatchers: []Matcher{}, LegacyScopes: []LegacyScope{}, Valid: true, AllowAllNamespaces: allowAllNamespaces}
	legacy := map[LegacyScope]bool{}
	legacyInputs := []Matcher{}
	for _, object := range objects {
		if !allowAllNamespaces && object.GetNamespace() != ProtectedNamespace {
			return Parameters{}, fmt.Errorf("untrusted exemption namespace %q", object.GetNamespace())
		}
		if object.GetUID() == "" {
			return Parameters{}, fmt.Errorf("exemption UID is required")
		}
		entries, found, err := unstructured.NestedSlice(object.Object, "spec", "exemptions")
		if err != nil {
			return Parameters{}, err
		}
		if !found {
			continue
		}
		for _, raw := range entries {
			entry, ok := raw.(map[string]interface{})
			if !ok {
				return Parameters{}, fmt.Errorf("malformed exemption entry")
			}
			matchers, scopes, err := compileEntry(entry, string(object.GetUID()))
			if err != nil {
				return Parameters{}, err
			}
			result.NativeMatchers = append(result.NativeMatchers, matchers...)
			for _, scope := range scopes {
				legacy[scope] = true
				matcher := entry["matcher"].(map[string]interface{})
				legacyInputs = append(legacyInputs, Matcher{Policy: scope.Policy, Namespace: scope.Namespace, Pattern: matcher["name"].(string), Owner: string(object.GetUID())})
			}
		}
	}
	for scope := range legacy {
		result.LegacyScopes = append(result.LegacyScopes, scope)
	}
	sort.Slice(result.NativeMatchers, func(i, j int) bool {
		return matcherKey(result.NativeMatchers[i]) < matcherKey(result.NativeMatchers[j])
	})
	sort.Slice(result.LegacyScopes, func(i, j int) bool {
		return result.LegacyScopes[i].Policy+"/"+result.LegacyScopes[i].Namespace < result.LegacyScopes[j].Policy+"/"+result.LegacyScopes[j].Namespace
	})
	sort.Slice(legacyInputs, func(i, j int) bool { return matcherKey(legacyInputs[i]) < matcherKey(legacyInputs[j]) })
	// Delegated scopes alone do not identify their authority: changing a
	// JavaScript-only expression or deleting one retained grant must change the
	// snapshot revision even while the namespace/policy delegation stays equal.
	raw, _ := json.Marshal(struct {
		Parameters   Parameters
		LegacyInputs []Matcher
	}{result, legacyInputs})
	digest := sha256.Sum256(raw)
	result.Revision = hex.EncodeToString(digest[:])
	return result, nil
}

func compileEntry(entry map[string]interface{}, owner string) ([]Matcher, []LegacyScope, error) {
	matcher, ok := entry["matcher"].(map[string]interface{})
	if !ok {
		return nil, nil, fmt.Errorf("matcher is required")
	}
	namespace, _ := matcher["namespace"].(string)
	pattern, _ := matcher["name"].(string)
	kind, _ := matcher["kind"].(string)
	if kind == "" {
		kind = "pod"
	}
	if namespace == "" {
		return nil, nil, fmt.Errorf("matcher namespace is required")
	}
	if strings.HasPrefix(pattern, "/") && strings.HasSuffix(pattern, "/") {
		return nil, nil, fmt.Errorf("regex delimiters are not supported")
	}
	if err := validateJSRegex(pattern); err != nil {
		return nil, nil, fmt.Errorf("invalid exemption regex: %w", err)
	}
	policies, ok := entry["policies"].([]interface{})
	if !ok {
		return nil, nil, fmt.Errorf("policies are required")
	}
	native := []Matcher{}
	legacy := []LegacyScope{}
	for _, raw := range policies {
		policy, ok := raw.(string)
		if !ok || !validPolicy(policy, kind) {
			return nil, nil, fmt.Errorf("incompatible exemption policy %v for %s", raw, kind)
		}
		if nativePattern(pattern) {
			native = append(native, Matcher{Policy: policy, Namespace: namespace, Pattern: pattern, Owner: owner})
		} else {
			legacy = append(legacy, LegacyScope{Policy: policy, Namespace: namespace})
		}
	}
	return native, legacy, nil
}

func validPolicy(policy, kind string) bool {
	if kind != "pod" && kind != "service" {
		return false
	}
	known := false
	for _, candidate := range Policies {
		if candidate == policy {
			known = true
			break
		}
	}
	service := policy == "RestrictExternalNames" || policy == "DisallowNodePortServices"
	return known && service == (kind == "service")
}

func matcherKey(m Matcher) string {
	return m.Policy + "/" + m.Namespace + "/" + m.Pattern + "/" + m.Owner
}

// Restrict native regex to a checked ASCII subset. Successful RE2 compilation
// alone is insufficient: JS and RE2 interpret some escapes differently.
func nativePattern(pattern string) bool {
	for index := 0; index < len(pattern); index++ {
		char := pattern[index]
		if char > 127 {
			return false
		}
		if char == '\\' {
			index++
			if index >= len(pattern) || !strings.ContainsRune("dDwWsSbB\\.^$*+?()[]{}|-", rune(pattern[index])) {
				return false
			}
		}
		if char == '(' && index+1 < len(pattern) && pattern[index+1] == '?' {
			if index+2 >= len(pattern) || pattern[index+2] != ':' {
				return false
			}
		}
	}
	_, err := regexp.Compile(pattern)
	return err == nil
}

func IsNativePattern(pattern string) bool  { return nativePattern(pattern) }
func ValidatePattern(pattern string) error { return validateJSRegex(pattern) }
