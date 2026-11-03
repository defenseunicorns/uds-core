// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package istio

import (
	"context"
	"crypto/sha256"
	"fmt"
	"strings"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/resources"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/dynamic"
	"k8s.io/utils/ptr"
)

func ingressServiceEntryName(pkgName, gateway, fqdn string) string {
	// Core's general sanitizer removes numeric suffixes and collapses punctuation.
	// A full DNS identity digest keeps distinct hosts stable across order/port edits.
	identity := strings.ToLower(pkgName + "\x00" + gateway + "\x00" + fqdn)
	digest := sha256.Sum256([]byte(identity))
	prefix := utils.SanitizeResourceName(pkgName + "-" + gateway + "-" + fqdn)
	if len(prefix) > 220 {
		prefix = strings.TrimRight(prefix[:220], "-")
	}
	return fmt.Sprintf("%s-%x-se", prefix, digest[:8])
}

func legacyIngressServiceEntryName(expose udstypes.Expose, pkgName string) string {
	return utils.SanitizeResourceName(fmt.Sprintf("%s-%s-%s", pkgName, normalizeGateway(expose.Gateway), utils.SanitizeResourceName(ingressHostName(ptr.Deref(expose.Host, "")))))
}

func purgeIngressServiceEntryAliases(ctx context.Context, client dynamic.Interface, pkg *udstypes.UDSPackage, desired, legacy map[string]bool) error {
	rc := client.Resource(serviceEntryGVR).Namespace(pkg.Namespace)
	list, err := rc.List(ctx, metav1.ListOptions{LabelSelector: "uds/package=" + pkg.Name})
	if err != nil {
		return fmt.Errorf("list ingress ServiceEntry aliases: %w", err)
	}
	for _, item := range list.Items {
		if desired[item.GetName()] || !resources.OwnedByPackage(&item, pkg.UID) {
			continue
		}
		if item.GetLabels()["uds/for"] != "ingress" && !legacy[item.GetName()] {
			continue
		}
		uid, version := item.GetUID(), item.GetResourceVersion()
		if err := rc.Delete(ctx, item.GetName(), metav1.DeleteOptions{Preconditions: &metav1.Preconditions{UID: &uid, ResourceVersion: &version}}); err != nil && !apierrors.IsNotFound(err) {
			return fmt.Errorf("delete stale ingress ServiceEntry %s: %w", item.GetName(), err)
		}
	}
	return nil
}
