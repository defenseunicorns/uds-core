// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"strings"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// --- RestrictIstioSidecarOverrides ---

func TestCheckIstioSidecarOverrides(t *testing.T) {
	t.Run("no annotations", func(t *testing.T) {
		pod := &corev1.Pod{}
		if v := checkIstioSidecarOverrides(pod); len(v) != 0 {
			t.Fatalf("expected no violations, got %v", v)
		}
	})

	t.Run("empty metadata", func(t *testing.T) {
		pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{}}
		if v := checkIstioSidecarOverrides(pod); len(v) != 0 {
			t.Fatalf("expected no violations, got %v", v)
		}
	})

	t.Run("detects blocked annotations", func(t *testing.T) {
		pod := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Annotations: map[string]string{
					"sidecar.istio.io/bootstrapOverride": "/path",
					"proxy.istio.io/config":              "custom",
					"sidecar.istio.io/userVolume":        "vol",
					"sidecar.istio.io/userVolumeMount":   "mount",
					"ignored/annotation":                 "value",
				},
			},
		}
		violations := checkIstioSidecarOverrides(pod)
		expected := []string{
			"proxy.istio.io/config",
			"sidecar.istio.io/bootstrapOverride",
			"sidecar.istio.io/userVolume",
			"sidecar.istio.io/userVolumeMount",
		}
		if len(violations) != len(expected) {
			t.Fatalf("expected %d violations, got %d: %v", len(expected), len(violations), violations)
		}
		for i, v := range violations {
			if v != expected[i] {
				t.Errorf("violation[%d] = %q, want %q", i, v, expected[i])
			}
		}
	})

	t.Run("case sensitive and no partial matches", func(t *testing.T) {
		pod := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Annotations: map[string]string{
					"SIDECAR.ISTIO.IO/BOOTSTRAPOVERRIDE": "/path",
					"sidecar.istio.io/userVolumeX":       "no-match",
				},
			},
		}
		if v := checkIstioSidecarOverrides(pod); len(v) != 0 {
			t.Fatalf("expected no violations, got %v", v)
		}
	})
}

func TestValidateIstioSidecarOverrides(t *testing.T) {
	t.Run("allowed when clean", func(t *testing.T) {
		pod := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Annotations: map[string]string{"safe/annotation": "ok"}},
		}
		allowed, _ := validateIstioSidecarOverrides(pod)
		if !allowed {
			t.Fatal("expected approval")
		}
	})

	t.Run("denied with violations", func(t *testing.T) {
		pod := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Annotations: map[string]string{
				"sidecar.istio.io/proxyImage": "evil:latest",
			}},
		}
		allowed, msg := validateIstioSidecarOverrides(pod)
		if allowed {
			t.Fatal("expected denial")
		}
		if !strings.Contains(msg, "sidecar.istio.io/proxyImage") {
			t.Fatalf("unexpected message: %s", msg)
		}
	})
}

// --- RestrictIstioTrafficOverrides ---

func TestCheckIstioTrafficOverrides(t *testing.T) {
	t.Run("no annotations or labels", func(t *testing.T) {
		pod := &corev1.Pod{}
		if v := checkIstioTrafficOverrides(pod); len(v) != 0 {
			t.Fatalf("expected no violations, got %v", v)
		}
	})

	t.Run("empty metadata", func(t *testing.T) {
		pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{}}
		if v := checkIstioTrafficOverrides(pod); len(v) != 0 {
			t.Fatalf("expected no violations, got %v", v)
		}
	})

	t.Run("detects blocked annotations and labels", func(t *testing.T) {
		pod := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Namespace: "test-namespace",
				Annotations: map[string]string{
					"sidecar.istio.io/inject":                      "false",
					"traffic.sidecar.istio.io/excludeInboundPorts": "8080",
					"some.other/annotation":                        "value",
				},
				Labels: map[string]string{
					"sidecar.istio.io/inject": "disabled",
					"app":                     "test-app",
				},
			},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{{Name: "app", Image: "app:latest"}},
			},
		}
		violations := checkIstioTrafficOverrides(pod)
		if !contains(violations, "annotation sidecar.istio.io/inject") {
			t.Errorf("expected annotation sidecar.istio.io/inject violation, got %v", violations)
		}
		if !contains(violations, "annotation traffic.sidecar.istio.io/excludeInboundPorts") {
			t.Errorf("expected annotation traffic...excludeInboundPorts violation, got %v", violations)
		}
		if !contains(violations, "label sidecar.istio.io/inject") {
			t.Errorf("expected label sidecar.istio.io/inject violation, got %v", violations)
		}
	})

	t.Run("allows inject=true annotation", func(t *testing.T) {
		pod := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Annotations: map[string]string{
					"sidecar.istio.io/inject": "true",
				},
			},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{{Name: "app"}},
			},
		}
		if v := checkIstioTrafficOverrides(pod); len(v) != 0 {
			t.Fatalf("expected no violations for inject=true, got %v", v)
		}
	})

	t.Run("allows inject annotation in istio-system", func(t *testing.T) {
		pod := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Namespace: "istio-system",
				Annotations: map[string]string{
					"sidecar.istio.io/inject": "false",
				},
			},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{{Name: "app"}},
			},
		}
		if v := checkIstioTrafficOverrides(pod); len(v) != 0 {
			t.Fatalf("expected no violations in istio-system, got %v", v)
		}
	})

	t.Run("allows inject label on waypoint pods", func(t *testing.T) {
		pod := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Labels: map[string]string{
					"sidecar.istio.io/inject": "false",
				},
			},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{
					{
						Name:  "istio-proxy",
						Image: "docker.io/istio/proxyv2:1.20.0",
						Args:  []string{"proxy", "waypoint", "--log-level=info"},
						Ports: []corev1.ContainerPort{{Name: "http-envoy-prom"}},
					},
				},
			},
		}
		if v := checkIstioTrafficOverrides(pod); len(v) != 0 {
			t.Fatalf("expected no violations for waypoint pod, got %v", v)
		}
	})

	t.Run("allows inject=true label", func(t *testing.T) {
		pod := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Labels: map[string]string{
					"sidecar.istio.io/inject": "true",
				},
			},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{{Name: "app"}},
			},
		}
		if v := checkIstioTrafficOverrides(pod); len(v) != 0 {
			t.Fatalf("expected no violations for inject=true label, got %v", v)
		}
	})

	t.Run("allows inject label in istio-system", func(t *testing.T) {
		pod := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Namespace: "istio-system",
				Labels: map[string]string{
					"sidecar.istio.io/inject": "false",
				},
			},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{{Name: "app"}},
			},
		}
		if v := checkIstioTrafficOverrides(pod); len(v) != 0 {
			t.Fatalf("expected no violations in istio-system, got %v", v)
		}
	})
}

func TestValidateIstioTrafficOverrides(t *testing.T) {
	t.Run("denied with message", func(t *testing.T) {
		pod := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Annotations: map[string]string{
					"traffic.sidecar.istio.io/excludeOutboundPorts": "443",
				},
			},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{{Name: "app"}},
			},
		}
		allowed, msg := validateIstioTrafficOverrides(pod)
		if allowed {
			t.Fatal("expected denial")
		}
		if !strings.Contains(msg, "traffic.sidecar.istio.io/excludeOutboundPorts") {
			t.Fatalf("unexpected message: %s", msg)
		}
	})
}

// --- RestrictIstioAmbientOverrides ---

func TestCheckIstioAmbientOverrides(t *testing.T) {
	t.Run("no annotations", func(t *testing.T) {
		pod := &corev1.Pod{}
		if v := checkIstioAmbientOverrides(pod); len(v) != 0 {
			t.Fatalf("expected no violations, got %v", v)
		}
	})

	t.Run("empty metadata", func(t *testing.T) {
		pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{}}
		if v := checkIstioAmbientOverrides(pod); len(v) != 0 {
			t.Fatalf("expected no violations, got %v", v)
		}
	})

	t.Run("detects blocked ambient annotation", func(t *testing.T) {
		pod := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Annotations: map[string]string{
					"ambient.istio.io/bypass-inbound-capture": "true",
					"some.other/annotation":                   "value",
				},
			},
		}
		violations := checkIstioAmbientOverrides(pod)
		if len(violations) != 1 || violations[0] != "ambient.istio.io/bypass-inbound-capture" {
			t.Fatalf("expected one violation, got %v", violations)
		}
	})

	t.Run("ignores non-blocked annotations", func(t *testing.T) {
		pod := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Annotations: map[string]string{
					"ambient.istio.io/some-other-thing": "value",
				},
			},
		}
		if v := checkIstioAmbientOverrides(pod); len(v) != 0 {
			t.Fatalf("expected no violations, got %v", v)
		}
	})
}

func TestValidateIstioAmbientOverrides(t *testing.T) {
	t.Run("denied with message", func(t *testing.T) {
		pod := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Annotations: map[string]string{
					"ambient.istio.io/bypass-inbound-capture": "true",
				},
			},
		}
		allowed, msg := validateIstioAmbientOverrides(pod)
		if allowed {
			t.Fatal("expected denial")
		}
		if !strings.Contains(msg, "ambient.istio.io/bypass-inbound-capture") {
			t.Fatalf("unexpected message: %s", msg)
		}
	})

	t.Run("allowed when clean", func(t *testing.T) {
		pod := &corev1.Pod{}
		allowed, _ := validateIstioAmbientOverrides(pod)
		if !allowed {
			t.Fatal("expected approval")
		}
	})
}

// --- isWaypointPod ---

func TestIsWaypointPod(t *testing.T) {
	t.Run("true for waypoint container", func(t *testing.T) {
		containers := []corev1.Container{
			{
				Name:  "istio-proxy",
				Image: "docker.io/istio/proxyv2:1.20.0",
				Args:  []string{"proxy", "waypoint", "--log-level=info"},
				Ports: []corev1.ContainerPort{{Name: "http-envoy-prom"}},
			},
		}
		if !isWaypointPod(containers) {
			t.Fatal("expected true for waypoint pod")
		}
	})

	t.Run("false for regular sidecar", func(t *testing.T) {
		containers := []corev1.Container{
			{
				Name:  "istio-proxy",
				Image: "docker.io/istio/proxyv2:1.20.0",
				Args:  []string{"proxy", "sidecar"},
				Ports: []corev1.ContainerPort{{Name: "http-envoy-prom"}},
			},
		}
		if isWaypointPod(containers) {
			t.Fatal("expected false for sidecar")
		}
	})

	t.Run("false for regular app container", func(t *testing.T) {
		containers := []corev1.Container{
			{Name: "app", Image: "nginx"},
		}
		if isWaypointPod(containers) {
			t.Fatal("expected false for app container")
		}
	})

	t.Run("false for empty", func(t *testing.T) {
		if isWaypointPod(nil) {
			t.Fatal("expected false for nil")
		}
	})
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}
