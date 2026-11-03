// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"fmt"
	"log/slog"
	"strings"
)

func helmOwned(o object, release string) bool {
	return str(o, "metadata", "annotations", "meta.helm.sh/release-name") == release && str(o, "metadata", "annotations", "meta.helm.sh/release-namespace") == "pepr-system"
}
func hasCoreModule(objects []object) bool {
	for _, o := range objects {
		if legacyDeployment(o, "pepr-uds-core", "admission") {
			return true
		}
	}
	return false
}
func (c cluster) forgetRelease(release string) error {
	secrets, err := c.releaseSecrets(release)
	if err != nil {
		return err
	}
	for _, o := range secrets {
		if str(o, "metadata", "labels", "owner") != "helm" || str(o, "metadata", "labels", "name") != release || !strings.HasPrefix(str(o, "metadata", "name"), "sh.helm.release.v1."+release+".v") {
			continue
		}
		if err = c.remove(o); err != nil {
			return err
		}
	}
	return nil
}
func (c cluster) retire() error {
	namespace, err := c.get("namespace", "", "pepr-system")
	if err != nil || namespace == nil {
		return err
	}
	objects, err := c.releaseObjects("module")
	if err != nil {
		return err
	}
	if len(objects) > 0 && !hasCoreModule(objects) {
		return fmt.Errorf("legacy module release is not UDS Core; refusing retirement")
	}
	for _, phase := range []string{"callbacks", "workloads", "other"} {
		for _, wanted := range objects {
			kind := str(wanted, "kind")
			if kind == "Namespace" || kind == "CustomResourceDefinition" || kind == "Package" {
				continue
			}
			resource := resourceFor(kind)
			if resource == "" {
				if phase == "other" {
					slog.Warn("Retaining unrecognized legacy manifest object; inspect it separately", "kind", kind, "namespace", str(wanted, "metadata", "namespace"), "name", str(wanted, "metadata", "name"))
				}
				continue
			}
			isCallback := strings.HasSuffix(kind, "WebhookConfiguration")
			isWorkload := kind == "Deployment"
			if (phase == "callbacks" && !isCallback) || (phase == "workloads" && (!isWorkload || isCallback)) || (phase == "other" && (isCallback || isWorkload)) {
				continue
			}
			current, err := c.get(resource, str(wanted, "metadata", "namespace"), str(wanted, "metadata", "name"))
			if err != nil {
				return err
			}
			if current == nil {
				continue
			}
			if !helmOwned(current, "module") {
				return fmt.Errorf("legacy resource %s/%s no longer belongs to Core's module release", kind, str(current, "metadata", "name"))
			}
			if err = c.remove(current); err != nil {
				return err
			}
			if kind == "Deployment" {
				oldUID := str(current, "metadata", "uid")
				if err = poll(c.ctx, func() (bool, error) {
					live, err := c.get(resource, str(wanted, "metadata", "namespace"), str(wanted, "metadata", "name"))
					if err != nil {
						return false, err
					}
					if live == nil {
						return true, nil
					}
					if str(live, "metadata", "uid") != oldUID {
						return false, fmt.Errorf("legacy workload was replaced during retirement")
					}
					return false, nil
				}); err != nil {
					return err
				}
			}
		}
	}
	if err = c.retireCoreStores(); err != nil {
		return err
	}
	if err = c.forgetRelease("module"); err != nil {
		return err
	}
	// Configuration now belongs to Core's own namespace. API CRDs were adopted,
	// not deleted; their old release history must not be uninstalled later.
	config, err := c.releaseObjects("uds-operator-config")
	if err != nil {
		return err
	}
	for _, wanted := range config {
		kind := str(wanted, "kind")
		if kind == "Namespace" || kind == "CustomResourceDefinition" || kind == "ClusterConfig" {
			continue
		}
		resource := resourceFor(kind)
		if resource == "" {
			slog.Warn("Retaining unrecognized legacy config object; inspect it separately", "kind", kind, "namespace", str(wanted, "metadata", "namespace"), "name", str(wanted, "metadata", "name"))
			continue
		}
		current, err := c.get(resource, str(wanted, "metadata", "namespace"), str(wanted, "metadata", "name"))
		if err != nil {
			return err
		}
		if current == nil {
			continue
		}
		if !helmOwned(current, "uds-operator-config") {
			return fmt.Errorf("legacy config resource ownership changed")
		}
		if err = c.remove(current); err != nil {
			return err
		}
	}
	for _, release := range []string{"uds-operator-config", "uds-cluster-crds"} {
		if err = c.forgetRelease(release); err != nil {
			return err
		}
	}
	return nil
}

func (c cluster) retireCoreStores() error {
	// Pepr creates these runtime objects without Helm annotations or owner refs.
	// The SDK names are scoped by Core's fixed module UUID, not by capability.
	// Never list/delete stores for other modules or remove the shared CRD.
	for _, name := range []string{"pepr-uds-core-store", "pepr-uds-core-schedule"} {
		o, err := c.get("peprstores", "pepr-system", name)
		if err != nil {
			return err
		}
		if o == nil {
			continue
		}
		if str(o, "apiVersion") != "pepr.dev/v1" || str(o, "kind") != "PeprStore" || str(o, "metadata", "namespace") != "pepr-system" || str(o, "metadata", "name") != name {
			return fmt.Errorf("unrecognized Core store %s", name)
		}
		if owners, _ := get(o, "metadata", "ownerReferences").([]any); len(owners) != 0 {
			return fmt.Errorf("Core store %s acquired another owner", name)
		}
		if err = c.remove(o); err != nil {
			return err
		}
	}
	return nil
}
