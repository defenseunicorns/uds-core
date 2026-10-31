// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"time"
)

func mutationBootstrap(identity bool) error {
	if err := gate("identity", identity); err != nil {
		return err
	}
	data, err := os.ReadFile("native-dev-mutation-bootstrap.json")
	if err != nil {
		return err
	}
	objects, err := mutationObjects(data)
	if err != nil {
		return err
	}
	for _, obj := range objects {
		if err := applyMutationBootstrap(obj); err != nil {
			return err
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	return waitMutationCanary(ctx, time.Second)
}

func applyMutationBootstrap(obj map[string]interface{}) error {
	// The pinned Zarf Helm installer uses the "zarf" SSA manager. Seed the
	// exact same objects under that manager so API-defaulted atomic fields can
	// be handed to the active chart without a second manager conflict.
	// Do not force ownership away from an unrelated administrator.
	_, err := kube(obj, "apply", "--server-side", "--field-manager=zarf", "-f", "-")
	return err
}

func mutationObjects(data []byte) ([]map[string]interface{}, error) {
	var list struct {
		Items []map[string]interface{} `json:"items"`
	}
	if err := json.Unmarshal(data, &list); err != nil {
		return nil, err
	}
	if len(list.Items) != 8 {
		return nil, errors.New("exact four mutation definitions/bindings required before native validation")
	}
	counts, seen := map[string]int{}, map[string]bool{}
	for _, obj := range list.Items {
		kind, _ := obj["kind"].(string)
		name, _ := mapAt(obj, "metadata")["name"].(string)
		if (kind != "MutatingAdmissionPolicy" && kind != "MutatingAdmissionPolicyBinding") || obj["apiVersion"] != "admissionregistration.k8s.io/v1" {
			return nil, errors.New("mutation bootstrap can only install served v1 mutation definitions/bindings")
		}
		if name == "" || seen[kind+"/"+name] {
			return nil, errors.New("mutation bootstrap contains missing or duplicated policy names")
		}
		seen[kind+"/"+name] = true
		counts[kind]++
	}
	if counts["MutatingAdmissionPolicy"] != 4 || counts["MutatingAdmissionPolicyBinding"] != 4 {
		return nil, errors.New("mutation bootstrap requires four distinct definition/binding pairs")
	}
	for _, obj := range list.Items {
		if obj["kind"] == "MutatingAdmissionPolicyBinding" {
			name := fmt.Sprint(mapAt(obj, "metadata")["name"])
			if mapAt(obj, "spec")["policyName"] != name || !seen["MutatingAdmissionPolicy/"+name] {
				return nil, errors.New("mutation bootstrap binding has no matching included policy")
			}
		}
	}
	return list.Items, nil
}

func waitMutationCanary(ctx context.Context, interval time.Duration) error {
	for {
		if err := ctx.Err(); err != nil {
			return fmt.Errorf("native mutation stamp did not converge: %w", err)
		}
		err := mutationCanary()
		if err == nil {
			return nil
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("native mutation stamp did not converge; validation activation remains blocked: %w", err)
		case <-time.After(interval):
		}
	}
}

func mutationCanary() error {
	pod := object("Pod", "native-map-stamp-canary", "default")
	pod["spec"] = map[string]interface{}{"containers": []interface{}{map[string]interface{}{"name": "canary", "image": "invalid.example/never-pulled:canary"}}}
	result, err := kube(pod, "create", "--dry-run=server", "-f", "-", "-o", "json")
	if err != nil {
		return err
	}
	var mutated map[string]interface{}
	if err := json.Unmarshal(result, &mutated); err != nil {
		return err
	}
	params, err := get("admissionparameters.policy.uds.dev", "uds-policy-exemptions", "uds-native-grants")
	if err != nil {
		return err
	}
	spec := mapAt(params, "spec")
	revision, _ := spec["revision"].(string)
	if spec["valid"] != true || revision == "" || revision == "bootstrap-empty" {
		return errors.New("native mutation has no valid current authority snapshot")
	}
	if mapAt(mutated, "metadata", "annotations")["policy.uds.dev/native-mutation-revision"] != revision {
		return errors.New("native mutation stamp has not converged; validation activation remains blocked")
	}
	return nil
}
