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
	Policy    string         `json:"policy"`
	Namespace string         `json:"namespace"`
	Pattern   string         `json:"pattern"`
	Owner     string         `json:"owner"`
	Compiled  *regexp.Regexp `json:"-"`
}

// InvalidMatcher identifies one historical grant omitted from a valid snapshot.
type InvalidMatcher struct {
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	UID       string `json:"uid"`
	Index     int    `json:"index"`
	Pattern   string `json:"pattern"`
	Error     string `json:"error"`
}

const RE2Syntax = "https://github.com/google/re2/wiki/Syntax"

// One object contains the OR-union of grants. Multiple parameter objects must
// never turn this into the API server's AND-of-policy-evaluations semantics.
type Parameters struct {
	NativeMatchers     []Matcher        `json:"nativeMatchers"`
	InvalidMatchers    []InvalidMatcher `json:"-"`
	Revision           string           `json:"revision"`
	Valid              bool             `json:"valid"`
	AllowAllNamespaces bool             `json:"allowAllNamespaces"`
}

// Compile omits invalid historical regex matchers without revoking other grants.
// Structural and trust failures still invalidate the snapshot.
func Compile(objects []*unstructured.Unstructured, allowAllNamespaces bool) (Parameters, error) {
	result := Parameters{NativeMatchers: []Matcher{}, Valid: true, AllowAllNamespaces: allowAllNamespaces}
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
		for index, raw := range entries {
			entry, ok := raw.(map[string]interface{})
			if !ok {
				return Parameters{}, fmt.Errorf("malformed exemption entry")
			}
			matcher, _ := entry["matcher"].(map[string]interface{})
			pattern, _ := matcher["name"].(string)
			expression, regexErr := regexp.Compile(pattern)
			if regexErr != nil {
				result.InvalidMatchers = append(result.InvalidMatchers, InvalidMatcher{Namespace: object.GetNamespace(), Name: object.GetName(), UID: string(object.GetUID()), Index: index, Pattern: pattern, Error: regexErr.Error()})
				continue
			}
			matchers, err := compileEntry(entry, string(object.GetUID()), expression)
			if err != nil {
				return Parameters{}, err
			}
			result.NativeMatchers = append(result.NativeMatchers, matchers...)
		}
	}

	sort.Slice(result.NativeMatchers, func(i, j int) bool {
		return matcherKey(result.NativeMatchers[i]) < matcherKey(result.NativeMatchers[j])
	})
	sort.Slice(result.InvalidMatchers, func(i, j int) bool {
		a, b := result.InvalidMatchers[i], result.InvalidMatchers[j]
		if a.Namespace != b.Namespace {
			return a.Namespace < b.Namespace
		}
		if a.Name != b.Name {
			return a.Name < b.Name
		}
		return a.Index < b.Index
	})
	raw, _ := json.Marshal(result)
	digest := sha256.Sum256(raw)
	result.Revision = hex.EncodeToString(digest[:])
	return result, nil
}

func compileEntry(entry map[string]interface{}, owner string, expression *regexp.Regexp) ([]Matcher, error) {
	matcher, ok := entry["matcher"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("matcher is required")
	}
	namespace, _ := matcher["namespace"].(string)
	pattern, _ := matcher["name"].(string)
	kind, _ := matcher["kind"].(string)
	if kind == "" {
		kind = "pod"
	}
	if namespace == "" {
		return nil, fmt.Errorf("matcher namespace is required")
	}
	if strings.HasPrefix(pattern, "/") && strings.HasSuffix(pattern, "/") {
		return nil, fmt.Errorf("regex delimiters are not supported")
	}
	policies, ok := entry["policies"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("policies are required")
	}
	native := []Matcher{}
	for _, raw := range policies {
		policy, ok := raw.(string)
		if !ok || !validPolicy(policy, kind) {
			return nil, fmt.Errorf("incompatible exemption policy %v for %s", raw, kind)
		}
		native = append(native, Matcher{Policy: policy, Namespace: namespace, Pattern: pattern, Owner: owner, Compiled: expression})
	}
	return native, nil
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

func ValidatePattern(pattern string) error {
	_, err := regexp.Compile(pattern)
	return err
}
