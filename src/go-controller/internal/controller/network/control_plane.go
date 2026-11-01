// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package network

import (
	"fmt"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	networkingv1 "k8s.io/api/networking/v1"
)

// The controller must retain its API connection while creating its own initial
// isolation policies. These are the same declared grants, installed API-first.
func controlPlaneApplyOrder(pkg *udstypes.UDSPackage, namespace string, policies, apiPolicies []*networkingv1.NetworkPolicy) ([]*networkingv1.NetworkPolicy, error) {
	if namespace != "uds-system" || pkg.Name != "uds-controller" {
		return policies, nil
	}
	if len(apiPolicies) == 0 {
		return nil, fmt.Errorf("Core control-plane networking requires a Kubernetes API egress rule before isolation")
	}
	early := map[*networkingv1.NetworkPolicy]bool{}
	for _, policy := range apiPolicies {
		addressKnown := false
		for _, rule := range policy.Spec.Egress {
			for _, peer := range rule.To {
				addressKnown = addressKnown || (peer.IPBlock != nil && peer.IPBlock.CIDR != "0.0.0.0/32")
			}
		}
		if !addressKnown {
			return nil, fmt.Errorf("Core control-plane API discovery is unavailable; refusing to isolate the writer")
		}
		early[policy] = true
	}
	ordered := append([]*networkingv1.NetworkPolicy(nil), apiPolicies...)
	for _, policy := range policies {
		if !early[policy] {
			ordered = append(ordered, policy)
		}
	}
	return ordered, nil
}
