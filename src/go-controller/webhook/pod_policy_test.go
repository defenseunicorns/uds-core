// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"fmt"
	"strings"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func boolPtr(b bool) *bool    { return &b }
func int64Ptr(i int64) *int64 { return &i }

func TestIsRootPodSecurityContext(t *testing.T) {
	tests := []struct {
		name string
		ctx  *corev1.PodSecurityContext
		want bool
	}{
		{"nil context", nil, false},
		{"empty context", &corev1.PodSecurityContext{}, false},
		{"runAsNonRoot=false", &corev1.PodSecurityContext{RunAsNonRoot: boolPtr(false)}, true},
		{"runAsNonRoot=true", &corev1.PodSecurityContext{RunAsNonRoot: boolPtr(true)}, false},
		{"runAsUser=0", &corev1.PodSecurityContext{RunAsUser: int64Ptr(0)}, true},
		{"runAsUser=1000", &corev1.PodSecurityContext{RunAsUser: int64Ptr(1000)}, false},
		{"supplementalGroups contains 0", &corev1.PodSecurityContext{SupplementalGroups: []int64{0}}, true},
		{"supplementalGroups [10,0,999]", &corev1.PodSecurityContext{SupplementalGroups: []int64{10, 0, 999}}, true},
		{"supplementalGroups no zero", &corev1.PodSecurityContext{SupplementalGroups: []int64{1, 2, 3}}, false},
		{"supplementalGroups empty", &corev1.PodSecurityContext{SupplementalGroups: []int64{}}, false},
		{"compliant", &corev1.PodSecurityContext{RunAsNonRoot: boolPtr(true), RunAsUser: int64Ptr(1000), SupplementalGroups: []int64{1, 2}}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isRootPodSecurityContext(tt.ctx); got != tt.want {
				t.Errorf("isRootPodSecurityContext() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestIsRootContainerSecurityContext(t *testing.T) {
	tests := []struct {
		name string
		ctx  *corev1.SecurityContext
		want bool
	}{
		{"nil context", nil, false},
		{"empty context", &corev1.SecurityContext{}, false},
		{"runAsNonRoot=false", &corev1.SecurityContext{RunAsNonRoot: boolPtr(false)}, true},
		{"runAsUser=0", &corev1.SecurityContext{RunAsUser: int64Ptr(0)}, true},
		{"runAsUser=1000", &corev1.SecurityContext{RunAsUser: int64Ptr(1000)}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isRootContainerSecurityContext(tt.ctx); got != tt.want {
				t.Errorf("isRootContainerSecurityContext() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestValidateNonRootUser(t *testing.T) {
	t.Run("pod-level root denied", func(t *testing.T) {
		pod := &corev1.Pod{
			Spec: corev1.PodSpec{
				SecurityContext: &corev1.PodSecurityContext{RunAsNonRoot: boolPtr(false)},
				Containers:      []corev1.Container{{Name: "test", Image: "nginx"}},
			},
		}
		allowed, msg := validateNonRootUser(pod)
		if allowed {
			t.Fatal("expected denial")
		}
		if msg != "Pod level securityContext does not meet the non-root user requirement." {
			t.Fatalf("unexpected message: %s", msg)
		}
	})

	t.Run("container-level root denied", func(t *testing.T) {
		pod := &corev1.Pod{
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{
					{Name: "test", Image: "nginx", SecurityContext: &corev1.SecurityContext{RunAsUser: int64Ptr(0)}},
				},
			},
		}
		allowed, msg := validateNonRootUser(pod)
		if allowed {
			t.Fatal("expected denial")
		}
		if !strings.Contains(msg, "Containers must not run as root") {
			t.Fatalf("unexpected message: %s", msg)
		}
	})

	t.Run("compliant pod allowed", func(t *testing.T) {
		pod := &corev1.Pod{
			Spec: corev1.PodSpec{
				SecurityContext: &corev1.PodSecurityContext{RunAsNonRoot: boolPtr(true)},
				Containers: []corev1.Container{
					{Name: "test", Image: "nginx", SecurityContext: &corev1.SecurityContext{RunAsNonRoot: boolPtr(true), RunAsUser: int64Ptr(1000)}},
				},
			},
		}
		allowed, _ := validateNonRootUser(pod)
		if !allowed {
			t.Fatal("expected approval")
		}
	})
}

func TestSetNonRootUserDefaults(t *testing.T) {
	t.Run("applies defaults when no security context", func(t *testing.T) {
		pod := &corev1.Pod{
			Spec: corev1.PodSpec{Containers: []corev1.Container{{Name: "test"}}},
		}
		patches := setNonRootUserDefaults(pod)
		if len(patches) == 0 {
			t.Fatal("expected patches")
		}
		assertPatchContains(t, patches, "/spec/securityContext/runAsNonRoot", true)
		assertPatchContains(t, patches, "/spec/securityContext/runAsUser", int64(1000))
		assertPatchContains(t, patches, "/spec/securityContext/runAsGroup", int64(1000))
	})

	t.Run("respects label overrides", func(t *testing.T) {
		pod := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{
				"uds/user": "2001", "uds/group": "2002", "uds/fsgroup": "3003",
			}},
			Spec: corev1.PodSpec{Containers: []corev1.Container{{Name: "test"}}},
		}
		patches := setNonRootUserDefaults(pod)
		assertPatchContains(t, patches, "/spec/securityContext/runAsUser", int64(2001))
		assertPatchContains(t, patches, "/spec/securityContext/runAsGroup", int64(2002))
		assertPatchContains(t, patches, "/spec/securityContext/fsGroup", int64(3003))
	})

	t.Run("does not override existing values without labels", func(t *testing.T) {
		pod := &corev1.Pod{
			Spec: corev1.PodSpec{
				SecurityContext: &corev1.PodSecurityContext{
					RunAsNonRoot: boolPtr(true),
					RunAsUser:    int64Ptr(5000),
					RunAsGroup:   int64Ptr(6000),
				},
				Containers: []corev1.Container{{Name: "test"}},
			},
		}
		patches := setNonRootUserDefaults(pod)
		for _, p := range patches {
			if p.Path == "/spec/securityContext/runAsUser" || p.Path == "/spec/securityContext/runAsGroup" || p.Path == "/spec/securityContext/runAsNonRoot" {
				t.Fatalf("should not patch %s when already set", p.Path)
			}
		}
	})
}

func assertPatchContains(t *testing.T, patches []jsonPatchOp, path string, value interface{}) {
	t.Helper()
	for _, p := range patches {
		if p.Path == path && fmt.Sprintf("%v", p.Value) == fmt.Sprintf("%v", value) {
			return
		}
	}
	t.Errorf("no patch found for path %s with value %v; patches: %+v", path, value, patches)
}
