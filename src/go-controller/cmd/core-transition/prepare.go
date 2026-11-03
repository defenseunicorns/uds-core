// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import "fmt"

func (c cluster) adoptAPI() error {
	// CRD ownership belongs exclusively to the implementation-neutral CRD layer,
	// which can be deployed before base in functional-layer bundles.
	cfg, err := c.get("clusterconfig.uds.dev", "", "uds-cluster-config")
	if err != nil {
		return err
	}
	if cfg != nil && str(cfg, "metadata", "annotations", "meta.helm.sh/release-namespace") == "pepr-system" {
		if str(cfg, "metadata", "annotations", "meta.helm.sh/release-name") != "uds-operator-config" {
			return fmt.Errorf("ClusterConfig belongs to another release")
		}
		annotations := get(cfg, "metadata", "annotations").(map[string]any)
		annotations["meta.helm.sh/release-namespace"] = "uds-system"
		if err = c.patch("clusterconfig.uds.dev", "", "uds-cluster-config", append(preconditions(cfg), object{"op": "add", "path": "/metadata/annotations", "value": annotations})); err != nil {
			return err
		}
	}

	return nil
}

func legacyDeployment(o object, name, role string) bool {
	return str(o, "kind") == "Deployment" && str(o, "metadata", "namespace") == "pepr-system" && str(o, "metadata", "name") == name && str(o, "spec", "selector", "matchLabels", "app") == name && str(o, "spec", "selector", "matchLabels", "pepr.dev/controller") == role
}
func ownedBy(o object, kind, uid string) bool {
	owners, _ := get(o, "metadata", "ownerReferences").([]any)
	for _, raw := range owners {
		owner, _ := raw.(map[string]any)
		if owner["kind"] == kind && owner["uid"] == uid && owner["controller"] == true {
			return true
		}
	}
	return false
}
func (c cluster) drain() error {
	namespace, err := c.get("namespace", "", "pepr-system")
	if err != nil || namespace == nil {
		return err
	}
	const name = "pepr-uds-core-watcher"
	deployment, err := c.get("deployment", "pepr-system", name)
	if err != nil {
		return err
	}
	if deployment == nil {
		pods, err := c.list("pods", "pepr-system")
		if err != nil {
			return err
		}
		for _, pod := range pods {
			if str(pod, "metadata", "labels", "app") == name {
				return fmt.Errorf("orphaned Core watcher Pods remain; refusing a second writer")
			}
		}
		return nil
	}
	if !legacyDeployment(deployment, name, "watcher") {
		return fmt.Errorf("refusing to modify an unrecognized watcher deployment")
	}
	uid := str(deployment, "metadata", "uid")
	patch := append(preconditions(deployment), object{"op": "add", "path": "/spec/replicas", "value": 0})
	if err := c.patch("deployment", "pepr-system", name, patch); err != nil {
		return err
	}
	return poll(c.ctx, func() (bool, error) {
		current, err := c.get("deployment", "pepr-system", name)
		if err != nil {
			return false, err
		}
		if current != nil && (str(current, "metadata", "uid") != uid || get(current, "spec", "replicas") != float64(0)) {
			return false, fmt.Errorf("Core watcher changed during drain")
		}
		sets, err := c.list("replicasets", "pepr-system")
		if err != nil {
			return false, err
		}
		owned := map[string]bool{}
		for _, set := range sets {
			if ownedBy(set, "Deployment", uid) {
				owned[str(set, "metadata", "uid")] = true
			}
		}
		pods, err := c.list("pods", "pepr-system")
		if err != nil {
			return false, err
		}
		for _, pod := range pods {
			for set := range owned {
				if ownedBy(pod, "ReplicaSet", set) {
					return false, nil
				}
			}
		}
		return true, nil
	})
}
func (c cluster) snapshot() error {
	return poll(c.ctx, func() (bool, error) {
		o, err := c.get("admissionparameters.policy.uds.dev", "uds-policy-exemptions", "uds-native-grants")
		if err != nil {
			return false, err
		}
		revision := str(o, "spec", "revision")
		cfg, err := c.get("clusterconfig.uds.dev", "", "uds-cluster-config")
		if err != nil {
			return false, err
		}
		pkg, err := c.get("packages.uds.dev", "uds-system", "uds-controller")
		if err != nil {
			return false, err
		}
		generation, _ := get(pkg, "metadata", "generation").(float64)
		coreReady := str(pkg, "metadata", "uid") != "" && generation > 0 && str(pkg, "status", "phase") == "Ready" && get(pkg, "status", "observedGeneration") == generation
		return o != nil && get(o, "spec", "valid") == true && len(revision) == 64 && str(cfg, "status", "phase") == "Ready" && coreReady, nil
	})
}
