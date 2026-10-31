// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package udspackage

import (
	"context"

	"fmt"

	"sort"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"k8s.io/utils/ptr"

	udsv1alpha1 "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/authpolicy"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/cabundle"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/envoygateway"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/istio"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/monitoring"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/network"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/probes"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/sso"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/store"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
)

// PackageController handles reconciliation of UDS Package resources.
func (c *PackageController) reconcilePackageFlow(ctx context.Context, pkg *udsv1alpha1.UDSPackage) error {
	namespace := pkg.Namespace
	istioMode := pkg.Spec.GetServiceMeshMode()

	var netPolCount int
	var authPolCount int
	var endpoints []string
	var ssoClientNames []string
	var authserviceClients []udsv1alpha1.AuthserviceClient
	var monitors []string
	var probeNames []string
	var waypointEntries []store.WaypointEntry

	// 1. Network Policies
	if c.flags.NetworkPolicies {
		c.logger.Info("Reconciling network policies", "namespace", namespace, "package", pkg.Name, "istioMode", istioMode)
		count, err := network.Reconcile(ctx, c.kubeClient.NetworkingV1(), pkg, namespace, istioMode)
		if err != nil {
			return fmt.Errorf("network policies: %w", err)
		}
		netPolCount = count
		c.logger.Info("Network policies reconciled", "count", count, "namespace", namespace, "package", pkg.Name)
	} else {
		c.logger.Debug("Skipping network policies (disabled)", "package", pkg.Name)
	}

	// 2. Authorization Policies
	if c.flags.AuthorizationPolicies {
		c.logger.Info("Reconciling authorization policies", "namespace", namespace, "package", pkg.Name)
		count, err := authpolicy.Reconcile(ctx, c.dynamicClient, pkg, namespace, istioMode)
		if err != nil {
			return fmt.Errorf("authorization policies: %w", err)
		}
		authPolCount = count
		c.logger.Info("Authorization policies reconciled", "count", count, "namespace", namespace, "package", pkg.Name)
	} else {
		c.logger.Debug("Skipping authorization policies (disabled)", "package", pkg.Name)
	}

	// 3. Istio Injection
	if c.flags.IstioInjection {
		c.logger.Info("Configuring Istio injection", "namespace", namespace, "package", pkg.Name, "mode", istioMode)
		if err := istio.EnableIstio(ctx, c.kubeClient.CoreV1(), pkg); err != nil {
			return fmt.Errorf("istio injection: %w", err)
		}
		c.logger.Info("Istio injection configured", "namespace", namespace, "package", pkg.Name)
	} else {
		c.logger.Debug("Skipping istio injection (disabled)", "package", pkg.Name)
	}

	// 4. SSO (Keycloak + Authservice)
	// Preserve the last converged admission topology through retries. Stage the
	// replacement until all side effects and Ready status have succeeded.
	if c.flags.SSO {
		c.logger.Info("Checking SSO configuration", "package", pkg.Name, "ssoCount", len(pkg.Spec.Sso))
		if isIdentityDeployed(ctx, c.udsClient) {
			// Ensure the operator secret exists before reconciling Keycloak clients.
			// This handles the case where the Go controller started before the keycloak namespace existed.
			if err := sso.EnsureOperatorSecret(ctx, c.kubeClient.CoreV1()); err != nil {
				return err
			}
			c.logger.Info("Identity is deployed, reconciling Keycloak clients", "package", pkg.Name)
			ssoClients, err := sso.ReconcileKeycloak(ctx, c.kubeClient.CoreV1(), pkg)
			if err != nil {
				return fmt.Errorf("keycloak: %w", err)
			}
			for clientID := range ssoClients {
				ssoClientNames = append(ssoClientNames, clientID)
			}
			c.logger.Info("Keycloak clients reconciled", "clientCount", len(ssoClients), "package", pkg.Name)

			c.logger.Debug("Reconciling authservice configuration", "package", pkg.Name)
			ac, err := sso.ReconcileAuthservice(ctx, c.kubeClient, pkg, ssoClients)
			if err != nil {
				return fmt.Errorf("authservice: %w", err)
			}
			authserviceClients = ac
			c.logger.Info("Authservice clients reconciled", "clientCount", len(ac), "package", pkg.Name)

			if c.flags.AuthorizationPolicies {
				c.logger.Debug("Reconciling authservice Istio policies", "package", pkg.Name)
				if err := sso.ReconcileAuthservicePolicies(ctx, c.dynamicClient, pkg, namespace, istioMode); err != nil {
					return fmt.Errorf("authservice policies: %w", err)
				}
			}

			if c.flags.IstioInjection && istioMode == udsv1alpha1.Ambient {
				c.logger.Debug("Reconciling authservice waypoints", "package", pkg.Name)
				if err := sso.ReconcileAuthserviceWaypoints(ctx, c.dynamicClient, c.kubeClient, pkg, namespace); err != nil {
					return fmt.Errorf("authservice waypoints: %w", err)
				}
				// Populate the waypoint store so the mutating webhook can label new pods/services
				for _, ssoSpec := range pkg.Spec.Sso {
					if ssoSpec.EnableAuthserviceSelector == nil {
						continue
					}
					waypointEntries = append(waypointEntries, store.WaypointEntry{
						Selector:     ssoSpec.EnableAuthserviceSelector,
						WaypointName: utils.WaypointName(ssoSpec.ClientID),
					})
				}
			} else if c.flags.IstioInjection {
				if err := sso.PurgeAuthserviceWaypoints(ctx, c.dynamicClient, c.kubeClient, pkg, namespace); err != nil {
					return err
				}
			}
		} else if len(pkg.Spec.Sso) > 0 {
			return fmt.Errorf("Identity & Authorization is not deployed, but the package has SSO configuration")
		} else {
			c.logger.Debug("No SSO configuration and identity not deployed, skipping", "package", pkg.Name)
		}
	} else {
		c.logger.Debug("Skipping SSO (disabled)", "package", pkg.Name)
	}

	// 5. Istio Ingress
	if c.flags.IstioIngress {
		c.logger.Info("Reconciling Istio ingress resources", "namespace", namespace, "package", pkg.Name, "exposeCount", len(pkg.Spec.GetExpose()))
		ep, err := istio.ReconcileIngress(ctx, c.dynamicClient, pkg, namespace)
		if err != nil {
			return fmt.Errorf("istio ingress: %w", err)
		}
		endpoints = ep
		if err := envoygateway.Reconcile(ctx, c.dynamicClient, c.kubeClient, pkg, c.packageLister); err != nil {
			return fmt.Errorf("UDP ingress: %w", err)
		}
		c.logger.Info("Istio ingress resources reconciled", "endpointCount", len(ep), "endpoints", ep, "package", pkg.Name)
	} else {
		c.logger.Debug("Skipping istio ingress (disabled)", "package", pkg.Name)
	}

	// 6. Istio Egress
	if c.flags.IstioEgress {
		c.logger.Info("Reconciling Istio egress resources", "namespace", namespace, "package", pkg.Name)
		if err := istio.ReconcileEgressWithClients(ctx, c.dynamicClient, c.kubeClient, pkg, namespace, c.packageLister); err != nil {
			return fmt.Errorf("istio egress: %w", err)
		}
		c.logger.Info("Istio egress resources reconciled", "namespace", namespace, "package", pkg.Name)
	} else {
		c.logger.Debug("Skipping istio egress (disabled)", "package", pkg.Name)
	}

	// 7. Pod Monitors
	if c.flags.PodMonitors {
		c.logger.Info("Reconciling pod monitors", "namespace", namespace, "package", pkg.Name)
		names, err := monitoring.ReconcilePodMonitors(ctx, c.dynamicClient, pkg, namespace)
		if err != nil {
			return fmt.Errorf("pod monitors: %w", err)
		}
		monitors = append(monitors, names...)
		c.logger.Info("Pod monitors reconciled", "count", len(names), "names", names, "package", pkg.Name)
	} else {
		c.logger.Debug("Skipping pod monitors (disabled)", "package", pkg.Name)
	}

	// 8. Service Monitors
	if c.flags.ServiceMonitors {
		c.logger.Info("Reconciling service monitors", "namespace", namespace, "package", pkg.Name)
		names, err := monitoring.ReconcileServiceMonitors(ctx, c.dynamicClient, pkg, namespace)
		if err != nil {
			return fmt.Errorf("service monitors: %w", err)
		}
		monitors = append(monitors, names...)
		c.logger.Info("Service monitors reconciled", "count", len(names), "names", names, "package", pkg.Name)
	} else {
		c.logger.Debug("Skipping service monitors (disabled)", "package", pkg.Name)
	}

	// 9. Uptime Probes
	if c.flags.UptimeProbes {
		c.logger.Info("Reconciling uptime probes", "namespace", namespace, "package", pkg.Name)
		probeResult, err := probes.ReconcileWithClients(ctx, c.dynamicClient, c.kubeClient, pkg, namespace)
		if err != nil {
			return fmt.Errorf("uptime probes: %w", err)
		}
		probeNames = probeResult.ProbeNames
		ssoClientNames = append(ssoClientNames, probeResult.SSOClients...)
		c.logger.Info("Uptime probes reconciled", "probeCount", len(probeResult.ProbeNames), "probes", probeResult.ProbeNames, "package", pkg.Name)
	} else {
		c.logger.Debug("Skipping uptime probes (disabled)", "package", pkg.Name)
	}

	// 10. SSO Cleanup
	if c.flags.SSO {
		c.logger.Debug("Purging orphaned SSO clients", "package", pkg.Name, "currentClients", ssoClientNames)
		if err := sso.PurgeSSOClients(ctx, pkg, ssoClientNames); err != nil {
			return fmt.Errorf("purge orphaned SSO clients: %w", err)
		}
		if err := sso.PurgeAuthserviceClients(ctx, c.kubeClient, pkg); err != nil {
			return fmt.Errorf("purge authservice clients: %w", err)
		}
	}

	// 11. CA Bundle
	if c.flags.CABundle {
		c.logger.Info("Reconciling CA bundle", "namespace", namespace, "package", pkg.Name)
		if err := cabundle.Reconcile(ctx, c.kubeClient.CoreV1(), pkg, namespace); err != nil {
			return fmt.Errorf("ca bundle: %w", err)
		}
		c.logger.Info("CA bundle reconciled", "namespace", namespace, "package", pkg.Name)
	} else {
		c.logger.Debug("Skipping CA bundle (disabled)", "package", pkg.Name)
	}

	sort.Strings(ssoClientNames)
	// Update status to Ready
	authPolCountWithAuthservice := int64(authPolCount + len(authserviceClients)*2)
	netPolCount64 := int64(netPolCount)

	pkg.Status = udsv1alpha1.PackageStatus{
		Phase:                    ptr.To(udsv1alpha1.PhaseReady),
		Conditions:               readinessConditions(true),
		ObservedGeneration:       &pkg.Generation,
		MeshMode:                 &istioMode,
		SsoClients:               ssoClientNames,
		AuthserviceClients:       authserviceClients,
		Endpoints:                endpoints,
		Monitors:                 monitors,
		Probes:                   probeNames,
		NetworkPolicyCount:       &netPolCount64,
		AuthorizationPolicyCount: &authPolCountWithAuthservice,
		RetryAttempt:             ptr.To(int64(0)),
	}
	_, err := c.udsClient.UDSPackages(pkg.Namespace).UpdateStatus(ctx, pkg, metav1.UpdateOptions{})
	if err == nil {
		c.waypointStore.SetForPackage(namespace, string(pkg.UID), waypointEntries)
	}
	return err
}
