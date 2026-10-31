// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package istio

import (
	"context"
	"fmt"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/client-go/kubernetes"
	"k8s.io/utils/ptr"

	"sort"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	udsv1alpha1lister "github.com/defenseunicorns/uds-core/src/go-controller/client/listers/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/resources"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
)

var (
	sidecarGVR    = schema.GroupVersionResource{Group: "networking.istio.io", Version: "v1beta1", Resource: "sidecars"}
	egressAuthGVR = schema.GroupVersionResource{Group: "security.istio.io", Version: "v1beta1", Resource: "authorizationpolicies"}
	gatewayGVR    = schema.GroupVersionResource{Group: "gateway.networking.k8s.io", Version: "v1", Resource: "gateways"}
)

const ambientEgressNS = "istio-egress-ambient"

// hostPortProtocol groups allow rules by remote host.
type hostPortProtocol struct {
	Host     string
	Port     int32
	Protocol string // "TLS" or "HTTP"
}

// ambientHostData holds merged per-host data from all contributing packages.
type ambientHostData struct {
	pkgIDs        []string
	portProtocols []hostPortProtocol
	// portIdentities tracks per-port source identity for strict enforcement.
	portIdentities map[int32]*portIdentity
}

type portIdentity struct {
	saPrincipals []string
	namespaces   []string
}

// ReconcileEgress creates egress ServiceEntries and Sidecars for external traffic.
func ReconcileEgress(ctx context.Context, client dynamic.Interface, pkg *udstypes.UDSPackage, namespace string, packageLister udsv1alpha1lister.UDSPackageLister) error {
	return ReconcileEgressWithClients(ctx, client, nil, pkg, namespace, packageLister)
}
func ReconcileEgressWithClients(ctx context.Context, client dynamic.Interface, kubeClient kubernetes.Interface, pkg *udstypes.UDSPackage, namespace string, packageLister udsv1alpha1lister.UDSPackageLister) error {
	allPackages, err := packageLister.List(labels.Everything())
	if err != nil {
		return err
	}
	// Overlay the authoritative API read so an informer lag cannot resurrect the
	// trigger's deleted identity or stale ports during reconcile/finalization.
	packages := []*udstypes.UDSPackage{}
	for _, other := range allPackages {
		if other.Namespace == pkg.Namespace && other.Name == pkg.Name {
			continue
		}
		if other.DeletionTimestamp == nil {
			packages = append(packages, other)
		}
	}
	if pkg.DeletionTimestamp == nil {
		packages = append(packages, pkg)
	}
	hosts, err := hostMapFor(pkg)
	if err != nil {
		return err
	}
	if pkg.DeletionTimestamp == nil {
		if kubeClient != nil && len(hosts) > 0 {
			ns := "istio-egress-ambient"
			if pkg.Spec.GetServiceMeshMode() == udstypes.Sidecar {
				ns = "istio-egress-gateway"
			}
			if _, err := kubeClient.CoreV1().Namespaces().Get(ctx, ns, metav1.GetOptions{}); err != nil {
				return fmt.Errorf("egress infrastructure %s: %w", ns, err)
			}
			if pkg.Spec.GetServiceMeshMode() == udstypes.Sidecar {
				svc, err := kubeClient.CoreV1().Services(ns).Get(ctx, "egressgateway", metav1.GetOptions{})
				if err != nil {
					return err
				}
				for _, ports := range hosts {
					for _, port := range ports {
						found := false
						for _, available := range svc.Spec.Ports {
							if available.Port == port.Port {
								found = true
							}
						}
						if !found {
							return fmt.Errorf("egress gateway does not expose port %d", port.Port)
						}
					}
				}
			}
		}
		if err := reconcileLocalEgress(ctx, client, pkg, hosts); err != nil {
			return err
		}
	}
	if kubeClient == nil || namespaceExists(ctx, kubeClient, ambientEgressNS) {
		if err := reconcileAmbientEgress(ctx, client, pkg.Name, packages); err != nil {
			return err
		}
	}
	if kubeClient == nil || namespaceExists(ctx, kubeClient, "istio-egress-gateway") {
		if err := reconcileSharedSidecar(ctx, client, packages); err != nil {
			return err
		}
	}
	return nil
}
func namespaceExists(ctx context.Context, client kubernetes.Interface, name string) bool {
	_, err := client.CoreV1().Namespaces().Get(ctx, name, metav1.GetOptions{})
	return !apierrors.IsNotFound(err)
}
func allowedPorts(allow udstypes.Allow) []int32 {
	var ports []int32
	if len(allow.Ports) > 0 {
		for _, port := range allow.Ports {
			ports = append(ports, int32(port))
		}
	} else if allow.Port != nil {
		ports = []int32{int32(*allow.Port)}
	}
	return ports
}
func hostMapFor(pkg *udstypes.UDSPackage) (map[string][]hostPortProtocol, error) {
	hosts := map[string][]hostPortProtocol{}
	for _, allow := range pkg.Spec.GetAllow() {
		if allow.Direction != udstypes.Egress || allow.RemoteHost == nil {
			continue
		}
		protocol := string(ptr.Deref(allow.RemoteProtocol, udstypes.TLS))
		if protocol != "TLS" && protocol != "HTTP" {
			return nil, fmt.Errorf("remoteHost only supports TLS or HTTP")
		}
		ports := allowedPorts(allow)
		if len(ports) == 0 {
			port := int32(443)
			if protocol == "HTTP" {
				port = 80
			}
			ports = []int32{port}
		}
		for _, port := range ports {
			for _, existing := range hosts[*allow.RemoteHost] {
				if existing.Port == port && existing.Protocol != protocol {
					return nil, fmt.Errorf("protocol conflict for %s:%d", *allow.RemoteHost, port)
				}
			}
			hosts[*allow.RemoteHost] = append(hosts[*allow.RemoteHost], hostPortProtocol{Host: *allow.RemoteHost, Port: port, Protocol: protocol})
		}
	}
	for host, ports := range hosts {
		hosts[host] = sortedPorts(ports)
	}
	return hosts, nil
}
func sortedPorts(ports []hostPortProtocol) []hostPortProtocol {
	sort.Slice(ports, func(i, j int) bool {
		if ports[i].Port == ports[j].Port {
			return ports[i].Protocol < ports[j].Protocol
		}
		return ports[i].Port < ports[j].Port
	})
	result := []hostPortProtocol{}
	for _, port := range ports {
		if len(result) == 0 || result[len(result)-1] != port {
			result = append(result, port)
		}
	}
	return result
}
func reconcileLocalEgress(ctx context.Context, client dynamic.Interface, pkg *udstypes.UDSPackage, hosts map[string][]hostPortProtocol) error {
	// Core's central ambient contract deliberately has one ServiceEntry per host.
	// Per-namespace aliases get different synthetic VIPs and cannot inherit the
	// central targetRef policy; remove both legacy aliases and legacy local APs.
	if pkg.Spec.GetServiceMeshMode() == udstypes.Ambient {
		if err := purgeByNames(ctx, client, serviceEntryGVR, pkg.Namespace, "uds/package="+pkg.Name+",istio.io/use-waypoint=egress-waypoint", nil); err != nil {
			return err
		}
		if err := purgeByNames(ctx, client, egressAuthGVR, pkg.Namespace, "uds/package="+pkg.Name+",uds/for=egress", nil); err != nil {
			return err
		}
		return purgeByNames(ctx, client, sidecarGVR, pkg.Namespace, "uds/package="+pkg.Name, nil)
	}
	desiredSE := map[string]bool{}
	desiredSidecars := map[string]bool{}
	for host, ports := range hosts {
		se := buildLocalEgressServiceEntry(host, ports, pkg.Name, pkg.Namespace, utils.PkgGeneration(pkg), utils.GetOwnerRef(pkg))
		if pkg.Spec.GetServiceMeshMode() == udstypes.Ambient {
			labels := se.GetLabels()
			labels["istio.io/use-waypoint"] = "egress-waypoint"
			labels["istio.io/use-waypoint-namespace"] = ambientEgressNS
			se.SetLabels(labels)
		}
		labels := se.GetLabels()
		labels["uds/for"] = "egress"
		se.SetLabels(labels)
		if err := resources.ServerSideApply(ctx, client, serviceEntryGVR, se); err != nil {
			return err
		}
		desiredSE[se.GetName()] = true
	}
	if pkg.Spec.GetServiceMeshMode() == udstypes.Sidecar {
		for _, allow := range pkg.Spec.GetAllow() {
			if allow.Direction != udstypes.Egress || allow.RemoteHost == nil {
				continue
			}
			sc := buildEgressSidecar(pkg.Name, pkg.Namespace, utils.PkgGeneration(pkg), utils.GetOwnerRef(pkg))
			selector := allow.Selector
			if selector == nil {
				selector = allow.PodLabels
			}
			if len(selector) > 0 {
				keys := []string{}
				for k := range selector {
					keys = append(keys, k)
				}
				sort.Strings(keys)
				suffix := []string{}
				for _, k := range keys {
					suffix = append(suffix, k+"-"+selector[k])
				}
				sc.SetName(utils.SanitizeResourceName(pkg.Name + "-egress-" + strings.Join(suffix, "-")))
				_ = unstructured.SetNestedStringMap(sc.Object, selector, "spec", "workloadSelector", "labels")
			}
			if desiredSidecars[sc.GetName()] {
				continue
			}
			if err := resources.ServerSideApply(ctx, client, sidecarGVR, sc); err != nil {
				return err
			}
			desiredSidecars[sc.GetName()] = true
		}
	}
	if err := purgeByNames(ctx, client, serviceEntryGVR, pkg.Namespace, "uds/package="+pkg.Name+",uds/for=egress", desiredSE); err != nil {
		return err
	}
	return purgeByNames(ctx, client, sidecarGVR, pkg.Namespace, "uds/package="+pkg.Name, desiredSidecars)
}

// reconcileAmbientEgress rebuilds shared ambient egress resources from ALL ambient packages.
// It creates a ServiceEntry + AuthorizationPolicy per external host in istio-egress-ambient.
