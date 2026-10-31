// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"encoding/json"
	"fmt"
	"maps"
	"sort"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/store"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/client-go/tools/cache"
)

type topologyClient struct {
	ClientID string            `json:"clientId"`
	Selector map[string]string `json:"enableAuthserviceSelector"`
}
type topologyPackage struct {
	Metadata metav1.ObjectMeta `json:"metadata"`
	Spec     struct {
		Network struct {
			ServiceMesh struct {
				Mode string `json:"mode"`
			} `json:"serviceMesh"`
		} `json:"network"`
		SSO []topologyClient `json:"sso"`
	} `json:"spec"`
	Status struct {
		Phase              string `json:"phase"`
		ObservedGeneration int64  `json:"observedGeneration"`
		AuthserviceClients []struct {
			ClientID string            `json:"clientId"`
			Selector map[string]string `json:"selector"`
		} `json:"authserviceClients"`
	} `json:"status"`
}

func resolveWaypoint(ws *store.WaypointStore, informers []cache.SharedIndexInformer, namespace string, selectedLabels map[string]string) (string, error) {
	if len(informers) == 0 {
		// Standalone source fixtures retain the original store-only interface.
		return findWaypointForLabels(ws, namespace, selectedLabels), nil
	}
	informer := informers[0]
	if informer == nil || !informer.HasSynced() {
		return "", fmt.Errorf("Ambient SSO topology cache is not synchronized; retry the request")
	}
	packages, err := topologyPackages(informer, namespace)
	if err != nil {
		return "", err
	}
	selected := ""
	for _, pkg := range packages {
		route, required := packageWaypoint(ws, pkg, selectedLabels)
		if required && route == "" {
			return "", fmt.Errorf("Ambient SSO topology for Package %s/%s has not converged; retry the request", namespace, pkg.Metadata.Name)
		}
		if route != "" {
			if selected != "" && selected != route {
				return "", fmt.Errorf("Ambient SSO topology has conflicting selected routes; retry the request")
			}
			selected = route
		}
	}
	return selected, nil
}

func topologyPackages(informer cache.SharedIndexInformer, namespace string) ([]topologyPackage, error) {
	// Finalization can still require a converged route. Only actual informer
	// deletion revokes the owner's admission requirement; exact controller
	// retirement remains available through trustedTopologyRepair.
	return topologyPackageSnapshot(informer, namespace, true)
}

func topologyPackageSnapshot(informer cache.SharedIndexInformer, namespace string, includeDeleting bool) ([]topologyPackage, error) {
	result := []topologyPackage{}
	for _, cached := range informer.GetStore().List() {
		object, ok := cached.(*unstructured.Unstructured)
		if !ok {
			return nil, fmt.Errorf("Ambient SSO topology cache contains an unexpected Package; retry the request")
		}
		if object.GetNamespace() != namespace || (!includeDeleting && object.GetDeletionTimestamp() != nil) {
			continue
		}
		raw, err := json.Marshal(object.Object)
		if err != nil {
			return nil, err
		}
		var pkg topologyPackage
		if err := json.Unmarshal(raw, &pkg); err != nil {
			return nil, fmt.Errorf("Ambient SSO topology Package cannot be decoded; retry the request")
		}
		if pkg.Metadata.UID == "" {
			return nil, fmt.Errorf("Ambient SSO topology Package owner is missing; retry the request")
		}
		result = append(result, pkg)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Metadata.UID < result[j].Metadata.UID })
	return result, nil
}

func packageWaypoint(ws *store.WaypointStore, pkg topologyPackage, selectedLabels map[string]string) (string, bool) {
	entries := ws.GetForPackage(pkg.Metadata.Namespace, string(pkg.Metadata.UID))
	ready := pkg.Status.Phase == "Ready" && pkg.Status.ObservedGeneration == pkg.Metadata.Generation
	if !ready {
		// Prior converged authority stays usable through failed desired updates.
		// The owner UID prevents a replacement Package inheriting that route.
		for _, entry := range entries {
			if selectorMatches(entry.Selector, selectedLabels) {
				return entry.WaypointName, true
			}
		}
	}
	if pkg.Spec.Network.ServiceMesh.Mode == "" || pkg.Spec.Network.ServiceMesh.Mode == "ambient" {
		for _, client := range pkg.Spec.SSO {
			if client.Selector != nil && selectorMatches(client.Selector, selectedLabels) {
				for _, entry := range entries {
					if maps.Equal(entry.Selector, client.Selector) && entry.WaypointName == utils.WaypointName(client.ClientID) {
						return entry.WaypointName, true
					}
				}
				return "", true
			}
		}
	}
	if !ready {
		// Ownership journals only fence previously selected traffic on restart.
		// They cannot manufacture a converged route or grant topology authority.
		for _, historical := range pkg.Status.AuthserviceClients {
			if historical.Selector != nil && selectorMatches(historical.Selector, selectedLabels) {
				return "", true
			}
		}
	}
	return "", false
}

func selectorMatches(selector, selectedLabels map[string]string) bool {
	return labels.Set(selector).AsSelector().Matches(labels.Set(selectedLabels))
}
