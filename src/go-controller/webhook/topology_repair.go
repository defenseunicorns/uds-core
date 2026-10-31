// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"encoding/json"
	"maps"
	"reflect"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/store"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
	admissionv1 "k8s.io/api/admission/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/tools/cache"
)

type topologyRepairObject struct {
	Metadata metav1.ObjectMeta `json:"metadata"`
	Spec     map[string]any    `json:"spec"`
}

// Controller convergence labels existing objects before publishing Ready. Only
// its authenticated metadata-only, owner-correlated repair can cross that fence.
func trustedTopologyRepair(req *admissionv1.AdmissionRequest, ws *store.WaypointStore, informers []cache.SharedIndexInformer, service bool) bool {
	if req.Operation != admissionv1.Update || req.SubResource != "" || req.UserInfo.Username != "system:serviceaccount:uds-system:uds-controller" || len(informers) == 0 || informers[0] == nil || !informers[0].HasSynced() {
		return false
	}
	kind := "Pod"
	if service {
		kind = "Service"
	}
	if req.Kind.Group != "" || req.Kind.Version != "v1" || req.Kind.Kind != kind {
		return false
	}
	var old, current topologyRepairObject
	if json.Unmarshal(req.OldObject.Raw, &old) != nil || json.Unmarshal(req.Object.Raw, &current) != nil || !sameTopologyIdentity(old, current, req.Namespace) || current.Metadata.Name != req.Name {
		return false
	}
	if !sameUnrelatedLabels(old.Metadata.Labels, current.Metadata.Labels) {
		return false
	}
	selected := current.Metadata.Labels
	if service {
		selected = map[string]string{}
		if selector, ok := current.Spec["selector"].(map[string]any); ok {
			for key, value := range selector {
				text, valid := value.(string)
				if !valid {
					return false
				}
				selected[key] = text
			}
		}
	}
	packages, err := topologyPackageSnapshot(informers[0], req.Namespace, true)
	if err != nil {
		return false
	}
	for _, pkg := range packages {
		if authorizedTopologyLabels(pkg, ws, selected, old.Metadata.Labels, current.Metadata.Labels, service) {
			return true
		}
	}
	return false
}

func sameTopologyIdentity(old, current topologyRepairObject, namespace string) bool {
	return current.Metadata.UID != "" && current.Metadata.UID == old.Metadata.UID && current.Metadata.Name != "" && current.Metadata.Name == old.Metadata.Name && current.Metadata.Namespace == namespace && current.Metadata.Namespace == old.Metadata.Namespace && reflect.DeepEqual(current.Metadata.OwnerReferences, old.Metadata.OwnerReferences) && reflect.DeepEqual(current.Spec, old.Spec)
}

func sameUnrelatedLabels(old, current map[string]string) bool {
	before, after := maps.Clone(old), maps.Clone(current)
	for _, key := range []string{"istio.io/use-waypoint", "istio.io/ingress-use-waypoint"} {
		delete(before, key)
		delete(after, key)
	}
	return maps.Equal(before, after)
}

func authorizedTopologyLabels(pkg topologyPackage, ws *store.WaypointStore, selected, old, current map[string]string, service bool) bool {
	desired := ""
	if pkg.Metadata.DeletionTimestamp == nil && (pkg.Spec.Network.ServiceMesh.Mode == "" || pkg.Spec.Network.ServiceMesh.Mode == "ambient") {
		for _, client := range pkg.Spec.SSO {
			if client.Selector != nil && selectorMatches(client.Selector, selected) {
				desired = utils.WaypointName(client.ClientID)
				break
			}
		}
	}
	if desired != "" && current["istio.io/use-waypoint"] == desired && (!service || current["istio.io/ingress-use-waypoint"] == "true") {
		return true
	}
	oldRoute := old["istio.io/use-waypoint"]
	if current["istio.io/use-waypoint"] != "" || (service && current["istio.io/ingress-use-waypoint"] != "") || oldRoute == "" || oldRoute == desired {
		return false
	}
	if pkg.Metadata.DeletionTimestamp != nil {
		// A failed desired update can already have labeled its new selector
		// before another side effect fails. Its converged store and historical
		// journal may still describe only the old selector. Finalization must
		// also retire this exact same-owner declared route, without publishing it.
		for _, client := range pkg.Spec.SSO {
			if client.Selector != nil && utils.WaypointName(client.ClientID) == oldRoute && selectorMatches(client.Selector, selected) {
				return true
			}
		}
	}
	for _, entry := range ws.GetForPackage(pkg.Metadata.Namespace, string(pkg.Metadata.UID)) {
		if entry.WaypointName == oldRoute && selectorMatches(entry.Selector, selected) {
			return true
		}
	}
	for _, historical := range pkg.Status.AuthserviceClients {
		if historical.Selector != nil && utils.WaypointName(historical.ClientID) == oldRoute && selectorMatches(historical.Selector, selected) {
			return true
		}
	}
	return false
}
