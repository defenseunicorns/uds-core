// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"strings"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestIsPodUsingIstioUserID(t *testing.T) {
	tests := []struct {
		name string
		ctx  *corev1.PodSecurityContext
		want bool
	}{
		{"nil context", nil, false},
		{"empty context", &corev1.PodSecurityContext{}, false},
		{"runAsUser=1337", &corev1.PodSecurityContext{RunAsUser: int64Ptr(1337)}, true},
		{"runAsGroup=1337", &corev1.PodSecurityContext{RunAsGroup: int64Ptr(1337)}, true},
		{"fsGroup=1337", &corev1.PodSecurityContext{FSGroup: int64Ptr(1337)}, true},
		{"supplementalGroups contains 1337", &corev1.PodSecurityContext{SupplementalGroups: []int64{1000, 1337, 2000}}, true},
		{"non-istio values", &corev1.PodSecurityContext{
			RunAsUser:          int64Ptr(1000),
			RunAsGroup:         int64Ptr(2000),
			FSGroup:            int64Ptr(3000),
			SupplementalGroups: []int64{4000, 5000},
		}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isPodUsingIstioUserID(tt.ctx); got != tt.want {
				t.Errorf("isPodUsingIstioUserID() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestFindContainerUsingIstioUserID(t *testing.T) {
	t.Run("finds container with runAsUser=1337", func(t *testing.T) {
		containers := []corev1.Container{
			{Name: "container-1", SecurityContext: &corev1.SecurityContext{RunAsUser: int64Ptr(1000)}},
			{Name: "container-2", SecurityContext: &corev1.SecurityContext{RunAsUser: int64Ptr(1337)}},
		}
		if got := findContainerUsingIstioUserID(containers); got != "container-2" {
			t.Errorf("got %q, want %q", got, "container-2")
		}
	})

	t.Run("finds container with runAsGroup=1337", func(t *testing.T) {
		containers := []corev1.Container{
			{Name: "container-1", SecurityContext: &corev1.SecurityContext{RunAsUser: int64Ptr(1000)}},
			{Name: "container-3", SecurityContext: &corev1.SecurityContext{RunAsGroup: int64Ptr(1337)}},
		}
		if got := findContainerUsingIstioUserID(containers); got != "container-3" {
			t.Errorf("got %q, want %q", got, "container-3")
		}
	})

	t.Run("empty list", func(t *testing.T) {
		if got := findContainerUsingIstioUserID(nil); got != "" {
			t.Errorf("got %q, want empty", got)
		}
	})

	t.Run("no security context", func(t *testing.T) {
		containers := []corev1.Container{{Name: "no-context"}}
		if got := findContainerUsingIstioUserID(containers); got != "" {
			t.Errorf("got %q, want empty", got)
		}
	})

	t.Run("no match", func(t *testing.T) {
		containers := []corev1.Container{
			{Name: "no-match", SecurityContext: &corev1.SecurityContext{RunAsUser: int64Ptr(1000)}},
		}
		if got := findContainerUsingIstioUserID(containers); got != "" {
			t.Errorf("got %q, want empty", got)
		}
	})

	t.Run("skips istio-proxy container", func(t *testing.T) {
		containers := []corev1.Container{
			{
				Name:            "istio-proxy",
				Args:            []string{"proxy", "sidecar"},
				Ports:           []corev1.ContainerPort{{Name: "http-envoy-prom"}},
				SecurityContext: &corev1.SecurityContext{RunAsUser: int64Ptr(1337)},
			},
		}
		if got := findContainerUsingIstioUserID(containers); got != "" {
			t.Errorf("got %q, want empty (istio-proxy should be skipped)", got)
		}
	})
}

func TestValidateIstioUser(t *testing.T) {
	t.Run("pod-level 1337 denied", func(t *testing.T) {
		pod := &corev1.Pod{
			Spec: corev1.PodSpec{
				SecurityContext: &corev1.PodSecurityContext{RunAsUser: int64Ptr(1337)},
				Containers:      []corev1.Container{{Name: "app", Image: "nginx"}},
			},
		}
		allowed, msg := validateIstioUser(pod)
		if allowed {
			t.Fatal("expected denial")
		}
		if !strings.Contains(msg, "Pods cannot use UID/GID 1337") {
			t.Fatalf("unexpected message: %s", msg)
		}
	})

	t.Run("container-level 1337 denied", func(t *testing.T) {
		pod := &corev1.Pod{
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{
					{Name: "app", Image: "nginx", SecurityContext: &corev1.SecurityContext{RunAsUser: int64Ptr(1337)}},
				},
			},
		}
		allowed, msg := validateIstioUser(pod)
		if allowed {
			t.Fatal("expected denial")
		}
		if !strings.Contains(msg, "Container 'app'") {
			t.Fatalf("unexpected message: %s", msg)
		}
	})

	t.Run("istio-proxy with 1337 allowed", func(t *testing.T) {
		pod := &corev1.Pod{
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{
					{
						Name:            "istio-proxy",
						Image:           "docker.io/istio/proxyv2:1.20.0",
						Args:            []string{"proxy", "sidecar"},
						Ports:           []corev1.ContainerPort{{Name: "http-envoy-prom"}},
						SecurityContext: &corev1.SecurityContext{RunAsUser: int64Ptr(1337)},
					},
				},
			},
		}
		allowed, _ := validateIstioUser(pod)
		if !allowed {
			t.Fatal("expected approval for istio-proxy")
		}
	})

	t.Run("compliant pod allowed", func(t *testing.T) {
		pod := &corev1.Pod{
			Spec: corev1.PodSpec{
				SecurityContext: &corev1.PodSecurityContext{RunAsUser: int64Ptr(1000)},
				Containers: []corev1.Container{
					{Name: "app", Image: "nginx", SecurityContext: &corev1.SecurityContext{RunAsUser: int64Ptr(1000)}},
				},
			},
		}
		allowed, _ := validateIstioUser(pod)
		if !allowed {
			t.Fatal("expected approval")
		}
	})

	t.Run("init container with 1337 denied", func(t *testing.T) {
		pod := &corev1.Pod{
			Spec: corev1.PodSpec{
				InitContainers: []corev1.Container{
					{Name: "init-bad", Image: "busybox", SecurityContext: &corev1.SecurityContext{RunAsUser: int64Ptr(1337)}},
				},
				Containers: []corev1.Container{
					{Name: "app", Image: "nginx"},
				},
			},
		}
		allowed, msg := validateIstioUser(pod)
		if allowed {
			t.Fatal("expected denial")
		}
		if !strings.Contains(msg, "Container 'init-bad'") {
			t.Fatalf("unexpected message: %s", msg)
		}
	})

	t.Run("no security context at all allowed", func(t *testing.T) {
		pod := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "plain"},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{{Name: "app", Image: "nginx"}},
			},
		}
		allowed, _ := validateIstioUser(pod)
		if !allowed {
			t.Fatal("expected approval")
		}
	})
}
