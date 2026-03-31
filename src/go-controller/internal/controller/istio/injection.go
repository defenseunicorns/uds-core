// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package istio manages Istio injection, ingress VirtualServices/ServiceEntries,
// and egress resources for UDS Packages.
package istio

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
)

// EnableIstio configures the package namespace for the requested service mesh mode.
// It mirrors enableIstio in src/pepr/operator/controllers/istio/namespace.ts.
func EnableIstio(ctx context.Context, clientset kubernetes.Interface, pkg *udstypes.UDSPackage) error {
	namespace := pkg.Namespace
	istioMode := pkg.Spec.GetServiceMeshMode()

	ns, err := clientset.CoreV1().Namespaces().Get(ctx, namespace, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("get namespace %s: %w", namespace, err)
	}

	if ns.Labels == nil {
		ns.Labels = make(map[string]string)
	}
	if ns.Annotations == nil {
		ns.Annotations = make(map[string]string)
	}

	// Track which packages are active in this namespace
	ns.Annotations[fmt.Sprintf("uds.dev/pkg-%s", pkg.Name)] = string(istioMode)

	// Store original state if not already stored
	if _, ok := ns.Annotations["uds.dev/original-istio-state"]; !ok {
		original := "none"
		if val, ok := ns.Labels["istio-injection"]; ok {
			original = "injection-" + val
		} else if val, ok := ns.Labels["istio.io/dataplane-mode"]; ok {
			original = "dataplane-" + val
		}
		ns.Annotations["uds.dev/original-istio-state"] = original
	}

	switch istioMode {
	case udstypes.Sidecar:
		ns.Labels["istio-injection"] = "enabled"
		delete(ns.Labels, "istio.io/dataplane-mode")
	case udstypes.Ambient:
		ns.Labels["istio.io/dataplane-mode"] = "ambient"
		delete(ns.Labels, "istio-injection")
	default:
		ns.Labels["istio.io/dataplane-mode"] = "ambient"
		delete(ns.Labels, "istio-injection")
	}

	// Use merge patch to update namespace labels and annotations
	patch := map[string]interface{}{
		"metadata": map[string]interface{}{
			"labels":      ns.Labels,
			"annotations": ns.Annotations,
		},
	}
	patchData, err := json.Marshal(patch)
	if err != nil {
		return fmt.Errorf("marshal namespace patch: %w", err)
	}
	_, err = clientset.CoreV1().Namespaces().Patch(ctx, namespace, types.MergePatchType, patchData, metav1.PatchOptions{})
	if err != nil {
		return fmt.Errorf("patch namespace %s labels: %w", namespace, err)
	}

	slog.Info("Configured Istio injection", "namespace", namespace, "mode", istioMode)
	return nil
}

// CleanupNamespace restores the original Istio injection state for the namespace.
func CleanupNamespace(ctx context.Context, clientset kubernetes.Interface, pkg *udstypes.UDSPackage) error {
	namespace := pkg.Namespace

	ns, err := clientset.CoreV1().Namespaces().Get(ctx, namespace, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("get namespace %s: %w", namespace, err)
	}

	// Remove this package's tracking annotation
	delete(ns.Annotations, fmt.Sprintf("uds.dev/pkg-%s", pkg.Name))

	// Check if any other packages still reference this namespace
	hasOtherPkgs := false
	for k := range ns.Annotations {
		if len(k) > 12 && k[:12] == "uds.dev/pkg-" && k != fmt.Sprintf("uds.dev/pkg-%s", pkg.Name) {
			hasOtherPkgs = true
			break
		}
	}

	// Only restore original state if no other packages need this namespace
	if !hasOtherPkgs {
		original := ns.Annotations["uds.dev/original-istio-state"]
		delete(ns.Annotations, "uds.dev/original-istio-state")

		// Restore original state
		delete(ns.Labels, "istio-injection")
		delete(ns.Labels, "istio.io/dataplane-mode")

		switch {
		case original == "none" || original == "":
			// Leave labels cleared
		case len(original) > 10 && original[:10] == "injection-":
			ns.Labels["istio-injection"] = original[10:]
		case len(original) > 10 && original[:10] == "dataplane-":
			ns.Labels["istio.io/dataplane-mode"] = original[10:]
		}
	}

	patch := map[string]interface{}{
		"metadata": map[string]interface{}{
			"labels":      ns.Labels,
			"annotations": ns.Annotations,
		},
	}
	patchData, err := json.Marshal(patch)
	if err != nil {
		return fmt.Errorf("marshal namespace patch: %w", err)
	}
	_, err = clientset.CoreV1().Namespaces().Patch(ctx, namespace, types.MergePatchType, patchData, metav1.PatchOptions{})
	if err != nil {
		return fmt.Errorf("patch namespace %s: %w", namespace, err)
	}

	slog.Info("Cleaned up Istio injection", "namespace", namespace)
	return nil
}
