// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package istio

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/resources"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
)

var (
	virtualServiceGVR = schema.GroupVersionResource{Group: "networking.istio.io", Version: "v1beta1", Resource: "virtualservices"}
	serviceEntryGVR   = schema.GroupVersionResource{Group: "networking.istio.io", Version: "v1beta1", Resource: "serviceentries"}
)

// ReconcileIngress creates VirtualServices and ServiceEntries for all exposed
// services in the package and returns the list of endpoints (FQDNs).
func ReconcileIngress(ctx context.Context, client dynamic.Interface, pkg *udstypes.UDSPackage, namespace string) ([]string, error) {
	pkgName := pkg.Name
	generation := utils.PkgGeneration(pkg)
	ownerRefs := utils.GetOwnerRef(pkg)

	endpointSet := map[string]struct{}{}
	var endpoints []string

	slog.Debug("Istio ingress reconcile started",
		"package", pkgName, "namespace", namespace,
		"exposeCount", len(pkg.Spec.GetExpose()),
		"domain", config.Get().Domain, "adminDomain", config.Get().AdminDomain)

	for _, expose := range pkg.Spec.GetExpose() {
		fqdn := getFqdn(expose)
		if _, seen := endpointSet[fqdn]; !seen {
			endpointSet[fqdn] = struct{}{}
			endpoints = append(endpoints, fqdn)
		}

		gateway := normalizeGateway(expose.Gateway)
		service := utils.DerefString(expose.Service)
		slog.Debug("Processing expose entry",
			"package", pkgName, "host", expose.Host, "fqdn", fqdn,
			"gateway", gateway, "service", service,
			"port", expose.Port, "hasAdvancedHTTP", expose.AdvancedHTTP != nil)

		// Create VirtualService
		vs := buildVirtualService(expose, pkgName, namespace, generation, ownerRefs, fqdn)
		slog.Debug("Applying VirtualService",
			"name", vs.GetName(), "namespace", namespace, "fqdn", fqdn)
		if err := resources.ServerSideApply(ctx, client, virtualServiceGVR, vs); err != nil {
			return nil, fmt.Errorf("apply VirtualService for %s: %w", fqdn, err)
		}
		slog.Debug("Applied VirtualService successfully", "name", vs.GetName())

		// Create ServiceEntry
		se := buildIngressServiceEntry(expose, pkgName, namespace, generation, ownerRefs, fqdn)
		slog.Debug("Applying ServiceEntry",
			"name", se.GetName(), "namespace", namespace, "fqdn", fqdn)
		if err := resources.ServerSideApply(ctx, client, serviceEntryGVR, se); err != nil {
			return nil, fmt.Errorf("apply ServiceEntry for %s: %w", fqdn, err)
		}
		slog.Debug("Applied ServiceEntry successfully", "name", se.GetName())
	}

	// Purge orphaned VirtualServices and ServiceEntries
	if err := resources.PurgeOrphans(ctx, client, virtualServiceGVR, namespace, pkgName, generation, nil); err != nil {
		slog.Error("Failed to purge orphaned VirtualServices", "error", err)
	}
	if err := resources.PurgeOrphans(ctx, client, serviceEntryGVR, namespace, pkgName, generation, nil); err != nil {
		slog.Error("Failed to purge orphaned ServiceEntries", "error", err)
	}

	return endpoints, nil
}

func buildVirtualService(expose udstypes.Expose, pkgName, namespace, generation string, ownerRefs []metav1.OwnerReference, fqdn string) *unstructured.Unstructured {
	gateway := normalizeGateway(expose.Gateway)
	port := getPort(expose)
	service := utils.DerefString(expose.Service)
	if service == "" {
		service = expose.Host
	}

	// Build a deterministic name
	matchHash := ""
	if len(expose.Match) > 0 {
		h := sha256.New()
		data, _ := json.Marshal(expose.Match)
		h.Write(data)
		matchHash = fmt.Sprintf("%x", h.Sum(nil))[:8]
	}

	sanitizedHost := utils.SanitizeResourceName(expose.Host)
	nameParts := []string{pkgName, gateway, sanitizedHost, fmt.Sprintf("%d", port), service}
	if expose.Description != nil && *expose.Description != "" {
		nameParts = append(nameParts, utils.SanitizeResourceName(*expose.Description))
	} else if matchHash != "" {
		nameParts = append(nameParts, matchHash)
	}
	name := utils.SanitizeResourceName(strings.Join(nameParts, "-"))

	gatewayRef := fmt.Sprintf("istio-%s-gateway/%s-gateway", gateway, gateway)
	destination := map[string]interface{}{
		"host": fmt.Sprintf("%s.%s.svc.cluster.local", service, namespace),
		"port": map[string]interface{}{
			"number": int64(port),
		},
	}

	spec := map[string]interface{}{
		"hosts":    []interface{}{fqdn},
		"gateways": []interface{}{gatewayRef},
	}

	if gateway == "passthrough" {
		spec["tls"] = []interface{}{
			map[string]interface{}{
				"match": []interface{}{
					map[string]interface{}{
						"port":     int64(443),
						"sniHosts": []interface{}{fqdn},
					},
				},
				"route": []interface{}{
					map[string]interface{}{"destination": destination},
				},
			},
		}
	} else {
		httpRoute := map[string]interface{}{
			"route": []interface{}{
				map[string]interface{}{"destination": destination},
			},
		}

		// Apply advanced HTTP settings if present
		if expose.AdvancedHTTP != nil {
			applyAdvancedHTTP(httpRoute, expose.AdvancedHTTP)
		}

		spec["http"] = []interface{}{httpRoute}
	}

	vs := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "networking.istio.io/v1beta1",
			"kind":       "VirtualService",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": namespace,
				"labels": map[string]interface{}{
					"uds/package":    pkgName,
					"uds/generation": generation,
				},
			},
			"spec": spec,
		},
	}
	setOwnerRefs(vs, ownerRefs)
	return vs
}

func buildIngressServiceEntry(expose udstypes.Expose, pkgName, namespace, generation string, ownerRefs []metav1.OwnerReference, fqdn string) *unstructured.Unstructured {
	gateway := normalizeGateway(expose.Gateway)
	name := utils.SanitizeResourceName(fmt.Sprintf("%s-%s-%s", pkgName, gateway, utils.SanitizeResourceName(expose.Host)))

	se := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "networking.istio.io/v1beta1",
			"kind":       "ServiceEntry",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": namespace,
				"labels": map[string]interface{}{
					"uds/package":    pkgName,
					"uds/generation": generation,
				},
			},
			"spec": map[string]interface{}{
				"hosts":      []interface{}{fqdn},
				"location":   "MESH_INTERNAL",
				"resolution": "DNS",
				"ports": []interface{}{
					map[string]interface{}{
						"name":     "https",
						"number":   int64(443),
						"protocol": "HTTPS",
					},
				},
				"endpoints": []interface{}{
					map[string]interface{}{
						"address": fmt.Sprintf("%s-ingressgateway.istio-%s-gateway.svc.cluster.local", gateway, gateway),
					},
				},
			},
		},
	}
	setOwnerRefs(se, ownerRefs)
	return se
}

func getFqdn(expose udstypes.Expose) string {
	cfg := config.Get()
	gateway := normalizeGateway(expose.Gateway)

	domain := cfg.Domain
	if gateway == "admin" {
		domain = cfg.AdminDomain
	}
	if expose.Domain != nil && *expose.Domain != "" {
		domain = *expose.Domain
	}

	return fmt.Sprintf("%s.%s", expose.Host, domain)
}

func normalizeGateway(gw *string) string {
	if gw == nil || *gw == "" {
		return "tenant"
	}
	return strings.ToLower(*gw)
}

func getPort(expose udstypes.Expose) int32 {
	if expose.Port != nil {
		return int32(*expose.Port)
	}
	return 443
}

func applyAdvancedHTTP(route map[string]interface{}, adv *udstypes.AdvancedHTTP) {
	if adv.Timeout != nil {
		route["timeout"] = *adv.Timeout
	}
	if adv.Retries != nil {
		retries := map[string]interface{}{}
		if adv.Retries.Attempts != nil {
			retries["attempts"] = *adv.Retries.Attempts
		}
		if adv.Retries.PerTryTimeout != nil {
			retries["perTryTimeout"] = *adv.Retries.PerTryTimeout
		}
		if adv.Retries.RetryOn != nil {
			retries["retryOn"] = *adv.Retries.RetryOn
		}
		route["retries"] = retries
	}
	if adv.Redirect != nil {
		redirect := map[string]interface{}{}
		if adv.Redirect.URI != nil {
			redirect["uri"] = *adv.Redirect.URI
		}
		if adv.Redirect.Authority != nil {
			redirect["authority"] = *adv.Redirect.Authority
		}
		if adv.Redirect.Scheme != nil {
			redirect["scheme"] = *adv.Redirect.Scheme
		}
		if adv.Redirect.RedirectCode != nil {
			redirect["redirectCode"] = *adv.Redirect.RedirectCode
		}
		route["redirect"] = redirect
		// When redirect is set, remove route (they are mutually exclusive)
		delete(route, "route")
	}
	if adv.DirectResponse != nil {
		dr := map[string]interface{}{
			"status": adv.DirectResponse.Status,
		}
		if adv.DirectResponse.Body != nil {
			body := map[string]interface{}{}
			if adv.DirectResponse.Body.String != nil {
				body["string"] = *adv.DirectResponse.Body.String
			}
			dr["body"] = body
		}
		route["directResponse"] = dr
		delete(route, "route")
	}
	if adv.Rewrite != nil {
		rewrite := map[string]interface{}{}
		if adv.Rewrite.URI != nil {
			rewrite["uri"] = *adv.Rewrite.URI
		}
		if adv.Rewrite.Authority != nil {
			rewrite["authority"] = *adv.Rewrite.Authority
		}
		route["rewrite"] = rewrite
	}
	if adv.Headers != nil {
		headers := map[string]interface{}{}
		if adv.Headers.Request != nil {
			req := map[string]interface{}{}
			if len(adv.Headers.Request.Set) > 0 {
				req["set"] = toStringInterfaceMap(adv.Headers.Request.Set)
			}
			if len(adv.Headers.Request.Add) > 0 {
				req["add"] = toStringInterfaceMap(adv.Headers.Request.Add)
			}
			if len(adv.Headers.Request.Remove) > 0 {
				req["remove"] = toStringSliceInterface(adv.Headers.Request.Remove)
			}
			headers["request"] = req
		}
		if adv.Headers.Response != nil {
			resp := map[string]interface{}{}
			if len(adv.Headers.Response.Set) > 0 {
				resp["set"] = toStringInterfaceMap(adv.Headers.Response.Set)
			}
			if len(adv.Headers.Response.Add) > 0 {
				resp["add"] = toStringInterfaceMap(adv.Headers.Response.Add)
			}
			if len(adv.Headers.Response.Remove) > 0 {
				resp["remove"] = toStringSliceInterface(adv.Headers.Response.Remove)
			}
			headers["response"] = resp
		}
		route["headers"] = headers
	}
	if len(adv.Match) > 0 {
		var matches []interface{}
		for _, m := range adv.Match {
			match := map[string]interface{}{}
			if m.URI != nil {
				match["uri"] = stringMatchToMap(m.URI)
			}
			if m.Method != nil {
				match["method"] = stringMatchToMap(m.Method)
			}
			if m.Name != nil {
				match["name"] = *m.Name
			}
			if m.IgnoreURICase != nil {
				match["ignoreUriCase"] = *m.IgnoreURICase
			}
			matches = append(matches, match)
		}
		route["match"] = matches
	}
	if adv.CorsPolicy != nil {
		cors := map[string]interface{}{}
		if len(adv.CorsPolicy.AllowOrigins) > 0 {
			var origins []interface{}
			for _, o := range adv.CorsPolicy.AllowOrigins {
				origin := map[string]interface{}{}
				if o.Exact != nil {
					origin["exact"] = *o.Exact
				}
				if o.Prefix != nil {
					origin["prefix"] = *o.Prefix
				}
				if o.Regex != nil {
					origin["regex"] = *o.Regex
				}
				origins = append(origins, origin)
			}
			cors["allowOrigins"] = origins
		}
		if len(adv.CorsPolicy.AllowMethods) > 0 {
			cors["allowMethods"] = toStringSliceInterface(adv.CorsPolicy.AllowMethods)
		}
		if len(adv.CorsPolicy.AllowHeaders) > 0 {
			cors["allowHeaders"] = toStringSliceInterface(adv.CorsPolicy.AllowHeaders)
		}
		if len(adv.CorsPolicy.ExposeHeaders) > 0 {
			cors["exposeHeaders"] = toStringSliceInterface(adv.CorsPolicy.ExposeHeaders)
		}
		if adv.CorsPolicy.MaxAge != nil {
			cors["maxAge"] = *adv.CorsPolicy.MaxAge
		}
		if adv.CorsPolicy.AllowCredentials != nil {
			cors["allowCredentials"] = *adv.CorsPolicy.AllowCredentials
		}
		route["corsPolicy"] = cors
	}
}

func stringMatchToMap(sm *udstypes.StringMatch) map[string]interface{} {
	m := map[string]interface{}{}
	if sm.Exact != nil {
		m["exact"] = *sm.Exact
	}
	if sm.Prefix != nil {
		m["prefix"] = *sm.Prefix
	}
	if sm.Regex != nil {
		m["regex"] = *sm.Regex
	}
	return m
}

func toStringInterfaceMap(m map[string]string) map[string]interface{} {
	result := make(map[string]interface{}, len(m))
	for k, v := range m {
		result[k] = v
	}
	return result
}

func toStringSliceInterface(s []string) []interface{} {
	result := make([]interface{}, len(s))
	for i, v := range s {
		result[i] = v
	}
	return result
}

func setOwnerRefs(obj *unstructured.Unstructured, refs []metav1.OwnerReference) {
	if len(refs) > 0 {
		var refMaps []interface{}
		for _, ref := range refs {
			refMaps = append(refMaps, map[string]interface{}{
				"apiVersion": ref.APIVersion,
				"kind":       ref.Kind,
				"name":       ref.Name,
				"uid":        string(ref.UID),
			})
		}
		unstructured.SetNestedSlice(obj.Object, refMaps, "metadata", "ownerReferences")
	}
}
