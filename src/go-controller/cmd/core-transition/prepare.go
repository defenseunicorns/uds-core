// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import "fmt"

func (c cluster) adoptAPI() error {
	for _, name := range []string{"packages.uds.dev", "exemptions.uds.dev", "clusterconfig.uds.dev"} {
		o, err := c.get("customresourcedefinition", "", name)
		if err != nil {
			return err
		}
		if o == nil {
			continue
		}
		release := str(o, "metadata", "annotations", "meta.helm.sh/release-name")
		ns := str(o, "metadata", "annotations", "meta.helm.sh/release-namespace")
		if release != "uds-cluster-crds" || (ns != "pepr-system" && ns != "uds-system") {
			return fmt.Errorf("Core API %s belongs to another release; refusing ownership transfer", name)
		}
		if ns == "uds-system" {
			continue
		}
		annotations, _ := get(o, "metadata", "annotations").(map[string]any)
		labels, _ := get(o, "metadata", "labels").(map[string]any)
		if annotations == nil {
			annotations = map[string]any{}
		}
		if labels == nil {
			labels = map[string]any{}
		}
		annotations["meta.helm.sh/release-namespace"] = "uds-system"
		labels["app.kubernetes.io/managed-by"] = "Helm"
		patch := append(preconditions(o), object{"op": "add", "path": "/metadata/annotations", "value": annotations}, object{"op": "add", "path": "/metadata/labels", "value": labels})
		if err := c.patch("customresourcedefinition", "", name, patch); err != nil {
			return err
		}
	}
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
		return o != nil && get(o, "spec", "valid") == true && len(revision) == 64 && str(cfg, "status", "phase") == "Ready", nil
	})
}
