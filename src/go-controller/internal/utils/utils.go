// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package utils provides shared utility functions for the UDS controller.
package utils

import (
	"fmt"
	"regexp"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
)

var (
	nonAlphaNum    = regexp.MustCompile(`[^a-z0-9]+`)
	leadingNonAlpha = regexp.MustCompile(`^[^a-z]+`)
	trailingNonAlpha = regexp.MustCompile(`[^a-z]+$`)
)

// SanitizeResourceName mirrors the TypeScript sanitizeResourceName:
// lowercase, replace non-alphanumeric with '-', truncate to 250, strip
// leading/trailing non-letter characters.
func SanitizeResourceName(name string) string {
	name = strings.ToLower(name)
	name = nonAlphaNum.ReplaceAllString(name, "-")
	if len(name) > 250 {
		name = name[:250]
	}
	name = leadingNonAlpha.ReplaceAllString(name, "")
	name = trailingNonAlpha.ReplaceAllString(name, "")
	return name
}

// GetOwnerRef creates an owner reference slice pointing to the given UDSPackage.
func GetOwnerRef(pkg *udstypes.UDSPackage) []metav1.OwnerReference {
	return []metav1.OwnerReference{
		{
			APIVersion: pkg.APIVersion,
			Kind:       pkg.Kind,
			Name:       pkg.Name,
			UID:        pkg.UID,
		},
	}
}

// PkgGeneration returns the generation as a string for use in labels.
func PkgGeneration(pkg *udstypes.UDSPackage) string {
	return fmt.Sprintf("%d", pkg.Generation)
}

// StandardLabels returns the standard uds labels applied to owned resources.
func StandardLabels(pkgName, generation string) map[string]string {
	return map[string]string{
		"uds/package":    pkgName,
		"uds/generation": generation,
	}
}

// Ptr returns a pointer to the given value.
func Ptr[T any](v T) *T {
	return &v
}

// DerefString safely dereferences a *string, returning "" if nil.
func DerefString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// DerefFloat safely dereferences a *float64, returning 0 if nil.
func DerefFloat(f *float64) float64 {
	if f == nil {
		return 0
	}
	return *f
}

// DerefInt64 safely dereferences a *int64, returning 0 if nil.
func DerefInt64(i *int64) int64 {
	if i == nil {
		return 0
	}
	return *i
}
