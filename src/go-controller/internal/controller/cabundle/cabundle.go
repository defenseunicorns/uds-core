// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package cabundle creates CA bundle ConfigMaps for UDS Packages.
package cabundle

import (
	"context"
	"encoding/base64"
	"fmt"
	"log/slog"
	"strings"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	corev1client "k8s.io/client-go/kubernetes/typed/core/v1"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
)

const caBundleLabel = "uds/ca-bundle"

// Reconcile creates or updates the CA bundle ConfigMap for the package.
func Reconcile(ctx context.Context, coreClient corev1client.CoreV1Interface, pkg *udstypes.UDSPackage, namespace string) error {
	slog.Debug("CA bundle reconcile started",
		"package", pkg.Name, "namespace", namespace,
		"hasCaBundle", pkg.Spec.CABundle != nil)

	if pkg.Spec.CABundle == nil || pkg.Spec.CABundle.ConfigMap == nil {
		slog.Debug("No CA bundle spec, skipping", "package", pkg.Name)
		return nil
	}

	pkgName := pkg.Name
	generation := utils.PkgGeneration(pkg)
	ownerRefs := utils.GetOwnerRef(pkg)

	cmSpec := pkg.Spec.CABundle.ConfigMap
	cmName := "uds-trust-bundle"
	if cmSpec.Name != nil {
		cmName = *cmSpec.Name
	}
	cmKey := "ca-bundle.pem"
	if cmSpec.Key != nil {
		cmKey = *cmSpec.Key
	}

	slog.Debug("CA bundle ConfigMap details",
		"package", pkgName, "configMapName", cmName, "configMapKey", cmKey,
		"customLabels", len(cmSpec.Labels), "customAnnotations", len(cmSpec.Annotations))

	// Build the cert content
	content := buildCABundleContent()
	if content == "" {
		slog.Debug("No CA bundle content to create — cluster config has no certs",
			"package", pkgName)
		return nil
	}
	slog.Debug("CA bundle content built",
		"package", pkgName, "contentLength", len(content))

	labels := map[string]string{
		"uds/package":    pkgName,
		"uds/generation": generation,
		caBundleLabel:    "true",
	}
	for k, v := range cmSpec.Labels {
		labels[k] = v
	}

	annotations := make(map[string]string)
	for k, v := range cmSpec.Annotations {
		annotations[k] = v
	}

	cm := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:            cmName,
			Namespace:       namespace,
			Labels:          labels,
			Annotations:     annotations,
			OwnerReferences: ownerRefs,
		},
		Data: map[string]string{
			cmKey: content,
		},
	}

	existing, err := coreClient.ConfigMaps(namespace).Get(ctx, cmName, metav1.GetOptions{})
	if errors.IsNotFound(err) {
		slog.Debug("Creating new CA bundle ConfigMap",
			"name", cmName, "namespace", namespace)
		_, err = coreClient.ConfigMaps(namespace).Create(ctx, cm, metav1.CreateOptions{})
	} else if err == nil {
		slog.Debug("Updating existing CA bundle ConfigMap",
			"name", cmName, "namespace", namespace,
			"existingResourceVersion", existing.ResourceVersion)
		cm.ResourceVersion = existing.ResourceVersion
		_, err = coreClient.ConfigMaps(namespace).Update(ctx, cm, metav1.UpdateOptions{})
	}
	if err != nil {
		return fmt.Errorf("apply CA bundle ConfigMap %s: %w", cmName, err)
	}

	slog.Debug("Applied CA bundle ConfigMap successfully",
		"name", cmName, "namespace", namespace, "package", pkgName)

	// Purge orphans
	purgeOrphans(ctx, coreClient, namespace, pkgName, generation)

	return nil
}

func buildCABundleContent() string {
	cfg := config.Get()
	slog.Debug("Building CA bundle content",
		"hasCerts", cfg.CABundle.Certs != "",
		"certsLength", len(cfg.CABundle.Certs),
		"includeDoDCerts", cfg.CABundle.IncludeDoDCerts,
		"includePublicCerts", cfg.CABundle.IncludePublicCerts)

	var certs []string

	if cfg.CABundle.Certs != "" {
		decoded, err := base64.StdEncoding.DecodeString(cfg.CABundle.Certs)
		if err != nil {
			slog.Error("Failed to decode CA bundle certs", "error", err)
		} else {
			slog.Debug("Decoded user CA certs", "decodedLength", len(decoded))
			certs = append(certs, string(decoded))
		}
	}

	// Filter empty certs
	var filtered []string
	for _, c := range certs {
		c = strings.TrimSpace(c)
		if c != "" {
			filtered = append(filtered, c)
		}
	}

	result := strings.TrimSpace(strings.Join(filtered, "\n\n"))
	slog.Debug("CA bundle content result",
		"certCount", len(filtered), "totalLength", len(result))
	return result
}

func purgeOrphans(ctx context.Context, coreClient corev1client.CoreV1Interface, namespace, pkgName, generation string) {
	selector := fmt.Sprintf("uds/package=%s,%s=true", pkgName, caBundleLabel)
	slog.Debug("Purging orphaned CA bundle ConfigMaps",
		"namespace", namespace, "package", pkgName,
		"currentGeneration", generation, "selector", selector)

	list, err := coreClient.ConfigMaps(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: selector,
	})
	if err != nil {
		slog.Error("Failed to list ConfigMaps for orphan purge", "error", err)
		return
	}

	slog.Debug("Found CA bundle ConfigMaps for orphan check",
		"count", len(list.Items), "package", pkgName)
	for _, cm := range list.Items {
		if cm.Labels["uds/generation"] != generation {
			slog.Debug("Deleting orphaned CA bundle ConfigMap",
				"name", cm.Name, "namespace", namespace,
				"orphanGeneration", cm.Labels["uds/generation"],
				"currentGeneration", generation)
			if err := coreClient.ConfigMaps(namespace).Delete(ctx, cm.Name, metav1.DeleteOptions{}); err != nil {
				slog.Error("Failed to delete orphaned ConfigMap", "name", cm.Name, "error", err)
			}
		}
	}
}
