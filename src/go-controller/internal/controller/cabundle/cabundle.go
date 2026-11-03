// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package cabundle

import (
	"context"
	"encoding/base64"
	"fmt"
	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	corev1client "k8s.io/client-go/kubernetes/typed/core/v1"
	"k8s.io/utils/ptr"
	"reflect"
	"sort"
	"strings"
)

const caBundleLabel = "uds/ca-bundle"

func Reconcile(ctx context.Context, client corev1client.CoreV1Interface, pkg *udstypes.UDSPackage, namespace string) error {
	content, err := BuildContent()
	if err != nil {
		return err
	}
	name, key := "uds-trust-bundle", "ca-bundle.pem"
	labels := map[string]string{}
	annotations := map[string]string{}
	if pkg.Spec.CABundle != nil && pkg.Spec.CABundle.ConfigMap != nil {
		cm := pkg.Spec.CABundle.ConfigMap
		name = ptr.Deref(cm.Name, name)
		key = ptr.Deref(cm.Key, key)
		for k, v := range cm.Labels {
			labels[k] = v
		}
		for k, v := range cm.Annotations {
			annotations[k] = v
		}
	}
	if name == "" {
		name = "uds-trust-bundle"
	}
	if key == "" {
		key = "ca-bundle.pem"
	}
	labels["uds/package"] = pkg.Name
	labels["uds/generation"] = utils.PkgGeneration(pkg)
	labels[caBundleLabel] = "true"
	if content == "" {
		return purgeOrphans(ctx, client, namespace, pkg.Name, "", pkg.UID)
	}
	cm := &corev1.ConfigMap{ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace, Labels: labels, Annotations: annotations, OwnerReferences: utils.GetOwnerRef(pkg)}, Data: map[string]string{key: content}}
	existing, err := client.ConfigMaps(namespace).Get(ctx, name, metav1.GetOptions{})
	if apierrors.IsNotFound(err) {
		_, err = client.ConfigMaps(namespace).Create(ctx, cm, metav1.CreateOptions{})
	} else if err == nil {
		// Multiple Packages in a namespace share the default trust bundle. Keep all
		// owners so deleting one Package cannot garbage collect another's bundle.
		if name == "uds-trust-bundle" {
			for _, ref := range existing.OwnerReferences {
				found := false
				for _, desired := range cm.OwnerReferences {
					if desired.UID == ref.UID {
						found = true
					}
				}
				if !found {
					ref.Controller = nil
					cm.OwnerReferences = append(cm.OwnerReferences, ref)
				}
			}
			for i := range cm.OwnerReferences {
				cm.OwnerReferences[i].Controller = nil
			}
			sort.Slice(cm.OwnerReferences, func(i, j int) bool { return cm.OwnerReferences[i].UID < cm.OwnerReferences[j].UID })
			if existing.Labels["uds/package"] != "" && existing.Labels["uds/package"] != pkg.Name {
				cm.Labels["uds/package"] = existing.Labels["uds/package"]
				cm.Labels["uds/generation"] = existing.Labels["uds/generation"]
			}
		}
		cm.ResourceVersion = existing.ResourceVersion
		if reflect.DeepEqual(existing.Data, cm.Data) && reflect.DeepEqual(existing.Labels, cm.Labels) && reflect.DeepEqual(existing.Annotations, cm.Annotations) && reflect.DeepEqual(existing.OwnerReferences, cm.OwnerReferences) {
			err = nil
		} else {
			_, err = client.ConfigMaps(namespace).Update(ctx, cm, metav1.UpdateOptions{})
		}
	}
	if err != nil {
		return fmt.Errorf("apply CA bundle %s: %w", name, err)
	}
	return purgeOrphans(ctx, client, namespace, pkg.Name, utils.PkgGeneration(pkg), pkg.UID)
}

// BuildContent combines each configured certificate source, surfacing malformed
// base64 rather than silently publishing an incomplete trust bundle.
func BuildContent() (string, error) {
	cfg := config.Get().CABundle
	sources := []string{cfg.Certs}
	if cfg.IncludeDoDCerts {
		sources = append(sources, cfg.DoDCerts)
	}
	if cfg.IncludePublicCerts {
		sources = append(sources, cfg.PublicCerts)
	}
	var certs []string
	for _, source := range sources {
		if source == "" {
			continue
		}
		decoded, err := base64.StdEncoding.DecodeString(source)
		if err != nil {
			return "", fmt.Errorf("decode CA bundle: %w", err)
		}
		if cert := strings.TrimSpace(string(decoded)); cert != "" {
			certs = append(certs, cert)
		}
	}
	return strings.Join(certs, "\n\n"), nil
}

// EnsureIstioTrustBundle propagates global CA changes to Istiod's mounted bundle.
func EnsureIstioTrustBundle(ctx context.Context, client corev1client.CoreV1Interface) error {
	content, err := BuildContent()
	if err != nil {
		return err
	}
	cm, err := client.ConfigMaps("istio-system").Get(ctx, "uds-trust-bundle", metav1.GetOptions{})
	if apierrors.IsNotFound(err) {
		_, err = client.ConfigMaps("istio-system").Create(ctx, &corev1.ConfigMap{ObjectMeta: metav1.ObjectMeta{Name: "uds-trust-bundle", Namespace: "istio-system", Labels: map[string]string{"uds.dev/pod-reload": "true"}}, Data: map[string]string{"extra.pem": content}}, metav1.CreateOptions{})
		return err
	}
	if err != nil {
		return err
	}
	if cm.Data["extra.pem"] == content && cm.Labels["uds.dev/pod-reload"] == "true" {
		return nil
	}
	if cm.Data == nil {
		cm.Data = map[string]string{}
	}
	cm.Data["extra.pem"] = content
	if cm.Labels == nil {
		cm.Labels = map[string]string{}
	}
	cm.Labels["uds.dev/pod-reload"] = "true"
	_, err = client.ConfigMaps("istio-system").Update(ctx, cm, metav1.UpdateOptions{})
	return err
}

func purgeOrphans(ctx context.Context, client corev1client.CoreV1Interface, namespace, pkgName, generation string, packageUID types.UID) error {
	if packageUID == "" {
		return fmt.Errorf("cannot purge CA bundle without Package UID")
	}
	list, err := client.ConfigMaps(namespace).List(ctx, metav1.ListOptions{LabelSelector: fmt.Sprintf("uds/package=%s,%s=true", pkgName, caBundleLabel)})
	if err != nil {
		return err
	}
	for _, cm := range list.Items {
		if cm.Labels["uds/generation"] == generation && generation != "" {
			continue
		}
		var retained []metav1.OwnerReference
		owned := false
		for _, owner := range cm.OwnerReferences {
			if owner.APIVersion == "uds.dev/v1alpha1" && owner.Kind == "Package" && owner.UID == packageUID {
				owned = true
			} else {
				retained = append(retained, owner)
			}
		}
		if !owned {
			continue
		}
		if len(retained) > 0 {
			cm.OwnerReferences = retained
			delete(cm.Labels, "uds/package")
			delete(cm.Labels, "uds/generation")
			for _, owner := range retained {
				if owner.APIVersion == "uds.dev/v1alpha1" && owner.Kind == "Package" {
					cm.Labels["uds/package"] = owner.Name
					break
				}
			}
			if _, err := client.ConfigMaps(namespace).Update(ctx, &cm, metav1.UpdateOptions{}); err != nil {
				return err
			}
			continue
		}
		uid, version := cm.UID, cm.ResourceVersion
		if err := client.ConfigMaps(namespace).Delete(ctx, cm.Name, metav1.DeleteOptions{Preconditions: &metav1.Preconditions{UID: &uid, ResourceVersion: &version}}); err != nil && !apierrors.IsNotFound(err) {
			return err
		}
	}
	return nil
}
