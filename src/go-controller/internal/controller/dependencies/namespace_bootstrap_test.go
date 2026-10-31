// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package dependencies

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/sso"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/util/wait"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
	"k8s.io/client-go/tools/cache"
)

func waitConfigEvent(t *testing.T, ctx context.Context, ctrl *Controller) {
	t.Helper()
	if err := wait.PollUntilContextTimeout(ctx, time.Millisecond, 2*time.Second, true, func(context.Context) (bool, error) { return ctrl.queue.Len() > 0, nil }); err != nil {
		t.Fatal("Namespace event did not schedule real config reconciliation", err)
	}
}

func TestAuthserviceNamespaceCreationBootstrapsRealConfigAndRetriesDeployment(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	client := fake.NewClientset()
	factory := informers.NewSharedInformerFactory(client, 0)
	ctrl := New(client, factory, nil)
	t.Cleanup(ctrl.queue.ShutDown)
	ctrl.queue.Add("config")
	ctrl.processNext(ctx)
	if ctrl.queue.NumRequeues("config") != 0 {
		t.Fatal("absent optional Authservice namespace should not retry forever")
	}
	informer := factory.Core().V1().Namespaces().Informer()
	done := make(chan struct{})
	go func() { informer.Run(ctx.Done()); close(done) }()
	t.Cleanup(func() { cancel(); <-done })
	if !cache.WaitForCacheSync(ctx.Done(), informer.HasSynced) {
		t.Fatal("namespace informer did not synchronize")
	}
	ns := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "authservice", UID: "auth-ns"}, Status: corev1.NamespaceStatus{Phase: corev1.NamespaceActive}}
	if _, err := client.CoreV1().Namespaces().Create(ctx, ns, metav1.CreateOptions{}); err != nil {
		t.Fatal(err)
	}
	waitConfigEvent(t, ctx, ctrl)
	ctrl.processNext(ctx)
	secret, err := client.CoreV1().Secrets("authservice").Get(ctx, "authservice-uds", metav1.GetOptions{})
	if err != nil {
		t.Fatal("real configuration Secret was not created after Namespace event", err)
	}
	var config sso.AuthserviceConfig
	if err := json.Unmarshal(secret.Data["config.json"], &config); err != nil {
		t.Fatal(err)
	}
	if config.AllowUnmatched || len(config.Chains) != 1 || config.Chains[0].Name != "placeholder" || config.Chains[0].Match.Prefix != "localhost" || config.DefaultOIDC == nil || config.DefaultOIDC.SkipVerifyPeerCert {
		t.Fatal("bootstrap altered the original inactive localhost/default configuration")
	}
	if ctrl.queue.NumRequeues("config") != 1 {
		t.Fatal("missing real Deployment did not retry after Secret convergence")
	}
	if _, err := client.AppsV1().Deployments("authservice").Create(ctx, &appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Name: "authservice", Namespace: "authservice"}}, metav1.CreateOptions{}); err != nil {
		t.Fatal(err)
	}
	waitConfigEvent(t, ctx, ctrl)
	ctrl.processNext(ctx)
	if ctrl.queue.NumRequeues("config") != 0 {
		t.Fatal("successful real deployment rollout did not clear the retry")
	}
	deployment, _ := client.AppsV1().Deployments("authservice").Get(ctx, "authservice", metav1.GetOptions{})
	if deployment.Spec.Template.Annotations["pepr.dev/checksum"] == "" {
		t.Fatal("real deployment did not receive the config checksum")
	}
}

func TestAuthserviceNamespaceReplayPreservesRealClientChainsAndIgnoresOthers(t *testing.T) {
	ctx := context.Background()
	client := fake.NewClientset(
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "authservice"}},
		&appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Name: "authservice", Namespace: "authservice"}},
		&corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: "authservice-uds", Namespace: "authservice"}, Data: map[string][]byte{"config.json": []byte(`{"allow_unmatched_requests":false,"chains":[{"name":"real-existing-client"}]}`)}},
	)
	ctrl := New(client, informers.NewSharedInformerFactory(client, 0), nil)
	t.Cleanup(ctrl.queue.ShutDown)
	ctrl.namespaceChanged(&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "other"}})
	if ctrl.queue.Len() != 0 {
		t.Fatal("unrelated Namespace scheduled auth configuration writes")
	}
	ctrl.namespaceChanged(&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "authservice"}})
	ctrl.processNext(ctx)
	secret, _ := client.CoreV1().Secrets("authservice").Get(ctx, "authservice-uds", metav1.GetOptions{})
	var config sso.AuthserviceConfig
	if err := json.Unmarshal(secret.Data["config.json"], &config); err != nil {
		t.Fatal(err)
	}
	if len(config.Chains) != 1 || config.Chains[0].Name != "real-existing-client" {
		t.Fatal("namespace replay erased managed client chains")
	}
}

func TestAuthserviceNamespaceBootstrapCannotConcealForbiddenRead(t *testing.T) {
	client := fake.NewClientset()
	ctrl := New(client, informers.NewSharedInformerFactory(client, 0), nil)
	t.Cleanup(ctrl.queue.ShutDown)
	client.PrependReactor("get", "namespaces", func(ktesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("namespace read forbidden")
	})
	ctrl.namespaceChanged(&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "authservice"}})
	ctrl.processNext(context.Background())
	if ctrl.queue.NumRequeues("config") != 1 {
		t.Fatal("forbidden prerequisite observation was reported as success")
	}
	for _, action := range client.Actions() {
		if action.GetResource().Resource == "secrets" && (action.GetVerb() == "create" || action.GetVerb() == "update") {
			t.Fatal("credential/config authority written after forbidden observation")
		}
	}
}
