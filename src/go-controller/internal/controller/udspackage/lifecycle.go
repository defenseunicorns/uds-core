// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package udspackage

import (
	"context"

	"errors"
	"fmt"

	"slices"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/labels"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"k8s.io/utils/ptr"

	udsv1alpha1 "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	udsv1alpha1client "github.com/defenseunicorns/uds-core/src/go-controller/client/clientset/versioned/typed/uds/v1alpha1"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/envoygateway"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/istio"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/probes"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/sso"
)

func (c *PackageController) shouldSkip(pkg *udsv1alpha1.UDSPackage) bool {
	if c.recovery.dirty(pkg.UID) || pkg.Status.Phase == nil {
		return false
	}
	terminal := *pkg.Status.Phase == udsv1alpha1.PhaseReady || *pkg.Status.Phase == udsv1alpha1.PhaseFailed
	current := pkg.Status.ObservedGeneration != nil && pkg.Generation == *pkg.Status.ObservedGeneration
	return terminal && current
}

func (c *PackageController) handleFailure(ctx context.Context, pkg *udsv1alpha1.UDSPackage, reconcileErr error, epoch uint64) error {
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

		pkg.Status.Phase = ptr.To(udsv1alpha1.PhaseRetrying)
		pkg.Status.Conditions = readinessConditions(false)
		pkg.Status.RetryAttempt = &nextRetry
		_, err := c.udsClient.UDSPackages(pkg.Namespace).UpdateStatus(ctx, pkg, metav1.UpdateOptions{})
		if err != nil {
			return err
		}
		return reconcileErr

	}

	c.logger.Error("Reconciliation failed, max retries exhausted",
		"package", pkg.Name,
		"namespace", pkg.Namespace,
		"error", reconcileErr,
	)
	zero := int64(0)
	pkg.Status.Phase = ptr.To(udsv1alpha1.PhaseFailed)
	pkg.Status.Conditions = readinessConditions(false)
	pkg.Status.ObservedGeneration = &pkg.Generation
	pkg.Status.RetryAttempt = &zero
	_, err := c.udsClient.UDSPackages(pkg.Namespace).UpdateStatus(ctx, pkg, metav1.UpdateOptions{})
	if err == nil {
		c.recovery.complete(pkg.UID, epoch)
	}
	return err
}

func (c *PackageController) handleFinalizer(ctx context.Context, pkg *udsv1alpha1.UDSPackage) error {
	if !slices.Contains(pkg.Finalizers, packageFinalizer) {
		return nil
	}
	pkg.Status.Phase = ptr.To(udsv1alpha1.PhaseRemoving)
	updated, err := c.udsClient.UDSPackages(pkg.Namespace).UpdateStatus(ctx, pkg, metav1.UpdateOptions{})
	if err != nil {
		return err
	}
	pkg = updated
	if err := c.cleanupPackage(ctx, pkg); err != nil {
		pkg.Status.Phase = ptr.To(udsv1alpha1.PhaseRemovalFailed)
		_, statusErr := c.udsClient.UDSPackages(pkg.Namespace).UpdateStatus(ctx, pkg, metav1.UpdateOptions{})
		return errors.Join(err, statusErr)
	}
	latest, err := c.udsClient.UDSPackages(pkg.Namespace).Get(ctx, pkg.Name, metav1.GetOptions{})
	if apierrors.IsNotFound(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if latest.UID != pkg.UID {
		return fmt.Errorf("package replaced during finalization")
	}
	latest.Finalizers = removeFinalizer(latest.Finalizers, packageFinalizer)
	_, err = c.udsClient.UDSPackages(pkg.Namespace).Update(ctx, latest, metav1.UpdateOptions{})
	return err
}

func (c *PackageController) cleanupPackage(ctx context.Context, pkg *udsv1alpha1.UDSPackage) error {
	if c.flags.SSO {
		journalSSOOwnership(pkg)
		removed := pkg.DeepCopy()
		removed.Spec.Sso = nil
		if err := sso.PurgeAuthserviceClients(ctx, c.kubeClient, removed); err != nil {
			return err
		}
		if c.flags.AuthorizationPolicies {
			if err := sso.PurgeAuthservicePolicies(ctx, c.dynamicClient, pkg); err != nil {
				return err
			}
		}
		c.waypointStore.DeleteForPackage(pkg.Namespace, string(pkg.UID))
		if c.flags.IstioInjection {
			if err := sso.PurgeAuthserviceWaypoints(ctx, c.dynamicClient, c.kubeClient, pkg, pkg.Namespace); err != nil {
				return err
			}
		}
		if err := sso.PurgeSSOClients(ctx, pkg, nil); err != nil {
			return err
		}
	}
	if c.flags.IstioIngress {
		if err := envoygateway.Reconcile(ctx, c.dynamicClient, c.kubeClient, pkg, c.packageLister); err != nil {
			return err
		}
	}
	if c.flags.UptimeProbes {
		if err := probes.Cleanup(ctx, c.kubeClient, pkg); err != nil {
			return err
		}
	}
	if c.flags.IstioInjection {
		if err := istio.CleanupNamespace(ctx, c.kubeClient.CoreV1(), pkg); err != nil {
			return err
		}
	}
	if c.flags.IstioEgress {
		if err := istio.ReconcileEgressWithClients(ctx, c.dynamicClient, c.kubeClient, pkg, pkg.Namespace, c.packageLister); err != nil {
			return err
		}
	}
	return nil
}

// RequeueAll retries successful and failed generations when dependencies change.
func (c *PackageController) RequeueAll() {
	c.queueAll(true)
}

// Resync checks current API state without discarding successful recovery epochs.
// Informer events and changed dependencies invalidate the affected epochs; a
// periodic check alone must not turn every Ready Package into a full workflow.
func (c *PackageController) Resync() {
	c.queueAll(false)
}

func (c *PackageController) queueAll(invalidate bool) {
	packages, err := c.packageLister.List(labels.Everything())
	if err != nil {
		c.logger.Error("list packages for dependency update", "error", err)
		return
	}
	c.logger.Info("Package cache check scheduled", "packages", len(packages), "invalidateRecovery", invalidate)
	for _, pkg := range packages {
		// Exhausted external failures may recover without a Kubernetes event.
		// Keep their periodic retry while preserving clean Ready generations.
		if invalidate || (pkg.Status.Phase != nil && *pkg.Status.Phase == udsv1alpha1.PhaseFailed) {
			c.recovery.invalidate(pkg.UID)
		}
		c.enqueue(pkg)
	}
}

func removeFinalizer(finalizers []string, name string) []string {
	result := make([]string, 0, len(finalizers))
	for _, f := range finalizers {
		if f != name {
			result = append(result, f)
		}
	}
	return result
}

func readinessConditions(ready bool) []udsv1alpha1.Condition {
	status := udsv1alpha1.ConditionFalse
	message := "The package is not ready for use."
	if ready {
		status = udsv1alpha1.ConditionTrue
		message = "The package is ready for use."
	}
	return []udsv1alpha1.Condition{
		{
			Type:               "Ready",
			Status:             status,
			LastTransitionTime: metav1.Now(),
			Message:            message,
			Reason:             "ReconciliationComplete",
		},
	}
}

func isIdentityDeployed(ctx context.Context, pkgClient udsv1alpha1client.UdsV1alpha1Interface) bool {
	// Check if the keycloak Package CR exists in the keycloak namespace
	_, err := pkgClient.UDSPackages("keycloak").Get(ctx, "keycloak", metav1.GetOptions{})
	return err == nil
}
