// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package controller

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"
	"k8s.io/client-go/util/workqueue"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/authpolicy"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/cabundle"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/istio"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/monitoring"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/network"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/probes"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/sso"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/featureflags"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
)

var packageGVR = schema.GroupVersionResource{Group: "uds.dev", Version: "v1alpha1", Resource: "packages"}

// PackageController handles reconciliation of UDS Package resources.
type PackageController struct {
	logger        *slog.Logger
	clientset     kubernetes.Interface
	dynamicClient dynamic.Interface
	queue         workqueue.TypedRateLimitingInterface[string]
	flags         featureflags.Flags
	uidSeen       map[string]bool
}

// NewPackageController creates a new PackageController.
func NewPackageController(clientset kubernetes.Interface, dynamicClient dynamic.Interface, flags featureflags.Flags) *PackageController {
	return &PackageController{
		logger:        slog.Default(),
		clientset:     clientset,
		dynamicClient: dynamicClient,
		queue: workqueue.NewTypedRateLimitingQueueWithConfig(
			workqueue.DefaultTypedControllerRateLimiter[string](),
			workqueue.TypedRateLimitingQueueConfig[string]{Name: "packages"},
		),
		flags:   flags,
		uidSeen: make(map[string]bool),
	}
}

// Run starts the workqueue processing loop.
func (c *PackageController) Run(ctx context.Context, workers int) {
	defer c.queue.ShutDown()

	for i := 0; i < workers; i++ {
		go func() {
			for c.processNext(ctx) {
			}
		}()
	}

	<-ctx.Done()
}

func (c *PackageController) processNext(ctx context.Context) bool {
	key, shutdown := c.queue.Get()
	if shutdown {
		return false
	}
	defer c.queue.Done(key)

	err := c.syncHandler(ctx, key)
	if err != nil {
		c.logger.Error("Error processing package", "key", key, "error", err)
		c.queue.AddRateLimited(key)
		return true
	}
	c.queue.Forget(key)
	return true
}

func (c *PackageController) syncHandler(ctx context.Context, key string) error {
	// Fetch the current state of the package from the API
	namespace, name := splitKey(key)
	resource := c.dynamicClient.Resource(packageGVR).Namespace(namespace)

	unObj, err := resource.Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		c.logger.Info("Package no longer exists, skipping", "key", key)
		return nil
	}

	pkg, ok := parsePackageFromUnstructured(unObj)
	if !ok {
		return fmt.Errorf("failed to parse package %s", key)
	}

	// Check for deletion
	if pkg.DeletionTimestamp != nil {
		return c.handleFinalizer(ctx, pkg)
	}

	return c.reconcile(ctx, pkg)
}

// HandleAdd is called when a Package is created.
func (c *PackageController) HandleAdd(obj interface{}) {
	pkg, ok := parsePackage(obj)
	if !ok {
		return
	}
	c.queue.Add(fmt.Sprintf("%s/%s", pkg.Namespace, pkg.Name))
}

// HandleUpdate is called when a Package is updated.
func (c *PackageController) HandleUpdate(_, newObj interface{}) {
	pkg, ok := parsePackage(newObj)
	if !ok {
		return
	}
	c.queue.Add(fmt.Sprintf("%s/%s", pkg.Namespace, pkg.Name))
}

// HandleDelete is called when a Package is deleted.
func (c *PackageController) HandleDelete(obj interface{}) {
	pkg, ok := parsePackage(obj)
	if !ok {
		tombstone, ok := obj.(cache.DeletedFinalStateUnknown)
		if !ok {
			c.logger.Error("Could not decode deleted package object")
			return
		}
		pkg, ok = parsePackage(tombstone.Obj)
		if !ok {
			return
		}
	}

	c.logger.Info("Package deleted", "namespace", pkg.Namespace, "name", pkg.Name)
}

// reconcile brings the cluster state into alignment with the desired state.
func (c *PackageController) reconcile(ctx context.Context, pkg *udstypes.UDSPackage) error {
	namespace := pkg.Namespace
	name := pkg.Name

	c.logger.Info("Reconciling package",
		"namespace", namespace,
		"name", name,
		"phase", pkg.Status.Phase,
		"observedGeneration", pkg.Status.ObservedGeneration,
		"retryAttempt", pkg.Status.RetryAttempt,
	)

	if c.shouldSkip(pkg) {
		c.logger.Info("Skipping package reconciliation",
			"namespace", namespace, "name", name,
			"phase", pkg.Status.Phase,
			"observedGeneration", pkg.Status.ObservedGeneration,
		)
		return nil
	}

	// Handle exponential backoff for retries
	if pkg.Status.RetryAttempt != nil && *pkg.Status.RetryAttempt > 0 {
		backoffSeconds := math.Pow(3, float64(*pkg.Status.RetryAttempt))
		c.logger.Info("Waiting before retry",
			"namespace", namespace, "name", name,
			"backoffSeconds", backoffSeconds,
			"retryAttempt", *pkg.Status.RetryAttempt,
		)
		time.Sleep(time.Duration(backoffSeconds) * time.Second)
	}

	// Set status to Pending
	if err := c.updateStatus(ctx, pkg, &udstypes.StatusClass{
		Phase:      utils.Ptr(udstypes.PhasePending),
		Conditions: readinessConditions(false),
	}); err != nil {
		return fmt.Errorf("set Pending status: %w", err)
	}

	// Run the reconciliation flow
	if err := c.reconcilePackageFlow(ctx, pkg); err != nil {
		return c.handleFailure(ctx, pkg, err)
	}

	return nil
}

func (c *PackageController) reconcilePackageFlow(ctx context.Context, pkg *udstypes.UDSPackage) error {
	namespace := pkg.Namespace
	istioMode := pkg.Spec.GetServiceMeshMode()

	var netPolCount int
	var authPolCount int
	var endpoints []string
	var ssoClientNames []string
	var authserviceClients []udstypes.AuthserviceClient
	var monitors []string
	var probeNames []string

	// 1. Network Policies
	if c.flags.NetworkPolicies {
		c.logger.Info("Reconciling network policies", "namespace", namespace, "package", pkg.Name, "istioMode", istioMode)
		count, err := network.Reconcile(ctx, c.clientset, pkg, namespace, istioMode)
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
		if err := istio.EnableIstio(ctx, c.clientset, pkg); err != nil {
			return fmt.Errorf("istio injection: %w", err)
		}
		c.logger.Info("Istio injection configured", "namespace", namespace, "package", pkg.Name)
	} else {
		c.logger.Debug("Skipping istio injection (disabled)", "package", pkg.Name)
	}

	// 4. SSO (Keycloak + Authservice)
	if c.flags.SSO {
		c.logger.Info("Checking SSO configuration", "package", pkg.Name, "ssoCount", len(pkg.Spec.Sso))
		if isIdentityDeployed(ctx, c.dynamicClient) {
			// Ensure the operator secret exists before reconciling Keycloak clients.
			// This handles the case where the Go controller started before the keycloak namespace existed.
			sso.EnsureOperatorSecret(ctx, c.clientset)
			c.logger.Info("Identity is deployed, reconciling Keycloak clients", "package", pkg.Name)
			ssoClients, err := sso.ReconcileKeycloak(ctx, c.clientset, pkg)
			if err != nil {
				return fmt.Errorf("keycloak: %w", err)
			}
			for clientID := range ssoClients {
				ssoClientNames = append(ssoClientNames, clientID)
			}
			c.logger.Info("Keycloak clients reconciled", "clientCount", len(ssoClients), "package", pkg.Name)

			c.logger.Debug("Reconciling authservice configuration", "package", pkg.Name)
			ac, err := sso.ReconcileAuthservice(ctx, c.clientset, pkg, ssoClients)
			if err != nil {
				return fmt.Errorf("authservice: %w", err)
			}
			authserviceClients = ac
			c.logger.Info("Authservice clients reconciled", "clientCount", len(ac), "package", pkg.Name)
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
		c.logger.Info("Istio ingress resources reconciled", "endpointCount", len(ep), "endpoints", ep, "package", pkg.Name)
	} else {
		c.logger.Debug("Skipping istio ingress (disabled)", "package", pkg.Name)
	}

	// 6. Istio Egress
	if c.flags.IstioEgress {
		c.logger.Info("Reconciling Istio egress resources", "namespace", namespace, "package", pkg.Name)
		if err := istio.ReconcileEgress(ctx, c.dynamicClient, pkg, namespace); err != nil {
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
		probeResult, err := probes.Reconcile(ctx, c.dynamicClient, pkg, namespace)
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
			c.logger.Error("Failed to purge orphaned SSO clients", "error", err, "package", pkg.Name)
		}
		if err := sso.PurgeAuthserviceClients(ctx, c.clientset, pkg); err != nil {
			c.logger.Error("Failed to purge authservice clients", "error", err, "package", pkg.Name)
		}
	}

	// 11. CA Bundle
	if c.flags.CABundle {
		c.logger.Info("Reconciling CA bundle", "namespace", namespace, "package", pkg.Name)
		if err := cabundle.Reconcile(ctx, c.clientset, pkg, namespace); err != nil {
			return fmt.Errorf("ca bundle: %w", err)
		}
		c.logger.Info("CA bundle reconciled", "namespace", namespace, "package", pkg.Name)
	} else {
		c.logger.Debug("Skipping CA bundle (disabled)", "package", pkg.Name)
	}

	// Update status to Ready
	authPolCountWithAuthservice := int64(authPolCount + len(authserviceClients)*2)
	netPolCount64 := int64(netPolCount)

	return c.updateStatus(ctx, pkg, &udstypes.StatusClass{
		Phase:                    utils.Ptr(udstypes.PhaseReady),
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
		RetryAttempt:             utils.Ptr(int64(0)),
	})
}

func (c *PackageController) shouldSkip(pkg *udstypes.UDSPackage) bool {
	isRetrying := pkg.Status.Phase != nil && *pkg.Status.Phase == udstypes.PhaseRetrying
	isPending := pkg.Status.Phase != nil && *pkg.Status.Phase == udstypes.PhasePending
	isRemoving := pkg.DeletionTimestamp != nil ||
		(pkg.Status.Phase != nil && (*pkg.Status.Phase == udstypes.PhaseRemoving || *pkg.Status.Phase == udstypes.PhaseRemovalFailed))
	isCurrentGen := pkg.Status.ObservedGeneration != nil && pkg.Generation == *pkg.Status.ObservedGeneration

	// First time seen - always process
	if !c.uidSeen[string(pkg.UID)] {
		c.uidSeen[string(pkg.UID)] = true
		c.logger.Debug("First time seeing package, will process",
			"namespace", pkg.Namespace, "name", pkg.Name, "uid", pkg.UID)
		return false
	}

	if isRetrying {
		c.logger.Debug("Package is retrying, will process",
			"namespace", pkg.Namespace, "name", pkg.Name)
		return false
	}
	if isRemoving {
		c.logger.Debug("Package is removing, skipping reconciliation",
			"namespace", pkg.Namespace, "name", pkg.Name)
		return true
	}
	if isPending || isCurrentGen {
		c.logger.Debug("Package is pending or current generation already processed, skipping",
			"namespace", pkg.Namespace, "name", pkg.Name,
			"isPending", isPending, "isCurrentGen", isCurrentGen,
			"generation", pkg.Generation, "observedGeneration", pkg.Status.ObservedGeneration)
		return true
	}

	c.logger.Debug("Package needs reconciliation",
		"namespace", pkg.Namespace, "name", pkg.Name,
		"generation", pkg.Generation, "observedGeneration", pkg.Status.ObservedGeneration)
	return false
}

func (c *PackageController) handleFailure(ctx context.Context, pkg *udstypes.UDSPackage, reconcileErr error) error {
	retryAttempt := int64(0)
	if pkg.Status.RetryAttempt != nil {
		retryAttempt = *pkg.Status.RetryAttempt
	}

	if retryAttempt < 4 {
		nextRetry := retryAttempt + 1
		c.logger.Error("Reconciliation failed, retrying",
			"package", pkg.Name,
			"namespace", pkg.Namespace,
			"attempt", nextRetry,
			"error", reconcileErr,
		)
		return c.updateStatus(ctx, pkg, &udstypes.StatusClass{
			Phase:        utils.Ptr(udstypes.PhaseRetrying),
			Conditions:   readinessConditions(false),
			RetryAttempt: &nextRetry,
		})
	}

	c.logger.Error("Reconciliation failed, max retries exhausted",
		"package", pkg.Name,
		"namespace", pkg.Namespace,
		"error", reconcileErr,
	)
	zero := int64(0)
	return c.updateStatus(ctx, pkg, &udstypes.StatusClass{
		Phase:              utils.Ptr(udstypes.PhaseFailed),
		Conditions:         readinessConditions(false),
		ObservedGeneration: &pkg.Generation,
		RetryAttempt:       &zero,
	})
}

func (c *PackageController) handleFinalizer(ctx context.Context, pkg *udstypes.UDSPackage) error {
	// Skip if already removing
	if pkg.Status.Phase != nil && (*pkg.Status.Phase == udstypes.PhaseRemoving || *pkg.Status.Phase == udstypes.PhaseRemovalFailed) {
		return nil
	}

	// Skip if not yet fully reconciled
	if pkg.Status.Phase != nil && *pkg.Status.Phase != udstypes.PhaseReady && *pkg.Status.Phase != udstypes.PhaseFailed {
		c.logger.Debug("Waiting to finalize, package not yet reconciled",
			"namespace", pkg.Namespace, "name", pkg.Name)
		return nil
	}

	c.logger.Info("Finalizing package", "namespace", pkg.Namespace, "name", pkg.Name)

	if err := c.updateStatus(ctx, pkg, &udstypes.StatusClass{
		Phase: utils.Ptr(udstypes.PhaseRemoving),
	}); err != nil {
		return err
	}

	// Cleanup Istio injection
	if c.flags.IstioInjection {
		if err := istio.CleanupNamespace(ctx, c.clientset, pkg); err != nil {
			c.logger.Error("Failed to cleanup Istio injection", "error", err)
			c.updateStatus(ctx, pkg, &udstypes.StatusClass{Phase: utils.Ptr(udstypes.PhaseRemovalFailed)})
			return err
		}
	}

	// Cleanup SSO
	if c.flags.SSO {
		if err := sso.PurgeSSOClients(ctx, pkg, nil); err != nil {
			c.logger.Error("Failed to purge SSO clients during finalize", "error", err)
		}
		if err := sso.PurgeAuthserviceClients(ctx, c.clientset, pkg); err != nil {
			c.logger.Error("Failed to purge authservice clients during finalize", "error", err)
		}
	}

	// Other resources are cleaned up via owner references
	c.logger.Info("Package finalized successfully", "namespace", pkg.Namespace, "name", pkg.Name)
	return nil
}

func (c *PackageController) updateStatus(ctx context.Context, pkg *udstypes.UDSPackage, status *udstypes.StatusClass) error {
	statusPatch := map[string]interface{}{
		"status": status,
	}

	data, err := json.Marshal(statusPatch)
	if err != nil {
		return fmt.Errorf("marshal status: %w", err)
	}

	_, err = c.dynamicClient.Resource(packageGVR).Namespace(pkg.Namespace).Patch(
		ctx,
		pkg.Name,
		types.MergePatchType,
		data,
		metav1.PatchOptions{},
		"status",
	)
	if err != nil {
		return fmt.Errorf("patch status for %s/%s: %w", pkg.Namespace, pkg.Name, err)
	}

	c.logger.Debug("Updated package status",
		"namespace", pkg.Namespace, "name", pkg.Name,
		"phase", status.Phase,
	)
	return nil
}

func readinessConditions(ready bool) []udstypes.Condition {
	status := udstypes.ConditionFalse
	message := "The package is not ready for use."
	if ready {
		status = udstypes.ConditionTrue
		message = "The package is ready for use."
	}
	return []udstypes.Condition{
		{
			Type:               "Ready",
			Status:             status,
			LastTransitionTime: time.Now(),
			Message:            message,
			Reason:             "ReconciliationComplete",
		},
	}
}

func isIdentityDeployed(ctx context.Context, client dynamic.Interface) bool {
	// Check if the keycloak Package CR exists in the keycloak namespace
	_, err := client.Resource(packageGVR).Namespace("keycloak").Get(ctx, "keycloak", metav1.GetOptions{})
	return err == nil
}

func splitKey(key string) (namespace, name string) {
	parts := splitN(key, "/", 2)
	if len(parts) == 2 {
		return parts[0], parts[1]
	}
	return "", key
}

func splitN(s, sep string, n int) []string {
	result := make([]string, 0, n)
	for i := 0; i < n-1; i++ {
		idx := indexOf(s, sep)
		if idx < 0 {
			break
		}
		result = append(result, s[:idx])
		s = s[idx+len(sep):]
	}
	result = append(result, s)
	return result
}

func indexOf(s, sub string) int {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

// parsePackage converts an informer object to a typed Package by marshaling through JSON.
func parsePackage(obj interface{}) (*udstypes.UDSPackage, bool) {
	marshaler, ok := obj.(json.Marshaler)
	if !ok {
		return nil, false
	}
	raw, err := marshaler.MarshalJSON()
	if err != nil {
		slog.Error("Failed to marshal package object", "error", err)
		return nil, false
	}
	var pkg udstypes.UDSPackage
	if err := json.Unmarshal(raw, &pkg); err != nil {
		slog.Error("Failed to unmarshal package object", "error", err)
		return nil, false
	}
	return &pkg, true
}

func parsePackageFromUnstructured(obj *unstructured.Unstructured) (*udstypes.UDSPackage, bool) {
	raw, err := obj.MarshalJSON()
	if err != nil {
		slog.Error("Failed to marshal unstructured package", "error", err)
		return nil, false
	}
	var pkg udstypes.UDSPackage
	if err := json.Unmarshal(raw, &pkg); err != nil {
		slog.Error("Failed to unmarshal package", "error", err)
		return nil, false
	}
	return &pkg, true
}
