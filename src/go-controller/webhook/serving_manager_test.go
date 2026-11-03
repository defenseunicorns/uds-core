// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	admissionv1 "k8s.io/api/admissionregistration/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
)

func servingFixture(t *testing.T) (*fake.Clientset, []byte) {
	t.Helper()
	certificate, ca, err := generateSelfSignedCert()
	if err != nil {
		t.Fatal(err)
	}
	key, err := privateKeyPEM(certificate)
	if err != nil {
		t.Fatal(err)
	}
	objects := []runtime.Object{&corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: servingSecretName, Namespace: servingNamespace, ResourceVersion: "1"}, Type: corev1.SecretTypeTLS, Data: map[string][]byte{"tls.crt": ca, "tls.key": key, "ca.crt": ca}}}
	fail, port := admissionv1.Fail, int32(443)
	for _, name := range []string{webhookConfigName, "uds-controller-pods", "uds-controller-resources"} {
		base, path := "validate-pods", "/validate-pods"
		if name == webhookConfigName {
			base, path = "clusterconfig", "/validate-clusterconfig-delete"
		} else if name == "uds-controller-resources" {
			base, path = "validate-resources", "/validate-resources"
		}
		client := admissionv1.WebhookClientConfig{CABundle: ca, Service: &admissionv1.ServiceReference{Name: "uds-controller", Namespace: servingNamespace, Path: &path, Port: &port}}
		webhooks := []admissionv1.ValidatingWebhook{{Name: base + ".uds.dev", FailurePolicy: &fail, ClientConfig: client}}
		if name != webhookConfigName {
			webhooks = append(webhooks, admissionv1.ValidatingWebhook{Name: base + "-istio-system.uds.dev", FailurePolicy: &fail, ClientConfig: client})
		}
		objects = append(objects, &admissionv1.ValidatingWebhookConfiguration{ObjectMeta: metav1.ObjectMeta{Name: name, ResourceVersion: "1"}, Webhooks: webhooks})
	}
	for _, name := range []string{"uds-controller-pods", mutatingWebhookConfigName} {
		paths := map[string]string{"mutate-pods.uds.dev": "/mutate-pods", "mutate-pods-istio-system.uds.dev": "/mutate-pods"}
		if name == mutatingWebhookConfigName {
			paths = map[string]string{"pods.waypoint.uds.dev": "/mutate-pod-waypoint", "services.waypoint.uds.dev": "/mutate-service-waypoint"}
		}
		webhooks := []admissionv1.MutatingWebhook{}
		for entry, path := range paths {
			path := path
			webhooks = append(webhooks, admissionv1.MutatingWebhook{Name: entry, FailurePolicy: &fail, ClientConfig: admissionv1.WebhookClientConfig{CABundle: ca, Service: &admissionv1.ServiceReference{Name: "uds-controller", Namespace: servingNamespace, Path: &path, Port: &port}}})
		}
		objects = append(objects, &admissionv1.MutatingWebhookConfiguration{ObjectMeta: metav1.ObjectMeta{Name: name, ResourceVersion: "1"}, Webhooks: webhooks})
	}
	return fake.NewSimpleClientset(objects...), ca
}

func TestLateRegistrationAndCAOverwriteRepair(t *testing.T) {
	ctx := context.Background()
	client, ca := servingFixture(t)
	if err := client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Delete(ctx, "uds-controller-resources", metav1.DeleteOptions{}); err != nil {
		t.Fatal(err)
	}
	manager, err := newServingManager(ctx, client)
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Synchronize(ctx); err != nil || !manager.ready.Load() {
		t.Fatal("backend could not start before later registration")
	}
	_, err = client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Create(ctx, &admissionv1.ValidatingWebhookConfiguration{ObjectMeta: metav1.ObjectMeta{Name: "uds-controller-resources"}, Webhooks: []admissionv1.ValidatingWebhook{{Name: "resources.uds.dev"}}}, metav1.CreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	configuration, err := client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Get(ctx, "uds-controller-resources", metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if !manager.ready.Load() || !bytes.Equal(configuration.Webhooks[0].ClientConfig.CABundle, ca) {
		t.Fatal("late registration did not receive shared trust")
	}
	configuration.Webhooks[0].ClientConfig.CABundle = nil
	_, err = client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Update(ctx, configuration, metav1.UpdateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	configuration, _ = client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Get(ctx, "uds-controller-resources", metav1.GetOptions{})
	if !bytes.Equal(configuration.Webhooks[0].ClientConfig.CABundle, ca) {
		t.Fatal("chart CA overwrite was not repaired")
	}
}

func TestReplicaRotationOverlappingTrust(t *testing.T) {
	ctx := context.Background()
	client, oldCA := servingFixture(t)
	first, err := newServingManager(ctx, client)
	if err != nil {
		t.Fatal(err)
	}
	second, err := newServingManager(ctx, client)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	first.now = func() time.Time { return now }
	second.now = first.now
	if err := first.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	if err := second.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	firstServer := dynamicTLSServer(first)
	defer firstServer.Close()
	secondServer := dynamicTLSServer(second)
	defer secondServer.Close()
	newPair, newCA, err := generateSelfSignedCert()
	if err != nil {
		t.Fatal(err)
	}
	key, err := privateKeyPEM(newPair)
	if err != nil {
		t.Fatal(err)
	}
	secret, err := client.CoreV1().Secrets(servingNamespace).Get(ctx, servingSecretName, metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	secret.ResourceVersion = "2"
	secret.Data = map[string][]byte{"tls.crt": newCA, "tls.key": key, "ca.crt": newCA}
	if _, err := client.CoreV1().Secrets(servingNamespace).Update(ctx, secret, metav1.UpdateOptions{}); err != nil {
		t.Fatal(err)
	}
	if err := first.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	assertTLSWithCurrentBundle(t, client, firstServer.URL)
	assertTLSWithCurrentBundle(t, client, secondServer.URL)
	if !first.ready.Load() || !second.ready.Load() {
		t.Fatal("rotation drained both existing replicas")
	}
	configuration, _ := client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Get(ctx, "uds-controller-pods", metav1.GetOptions{})
	if !bytes.Contains(configuration.Webhooks[0].ClientConfig.CABundle, oldCA) || !bytes.Contains(configuration.Webhooks[0].ClientConfig.CABundle, newCA) {
		t.Fatal("rotation did not publish old/new overlap")
	}
	now = now.Add(trustPropagation + time.Second)
	if err := first.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	assertTLSWithCurrentBundle(t, client, firstServer.URL)
	assertTLSWithCurrentBundle(t, client, secondServer.URL)
	if err := second.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	assertTLSWithCurrentBundle(t, client, firstServer.URL)
	assertTLSWithCurrentBundle(t, client, secondServer.URL)
	now = now.Add(trustOverlap)
	if err := first.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	configuration, _ = client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Get(ctx, "uds-controller-pods", metav1.GetOptions{})
	if bytes.Contains(configuration.Webhooks[0].ClientConfig.CABundle, oldCA) || !bytes.Equal(configuration.Webhooks[0].ClientConfig.CABundle, newCA) {
		t.Fatal("old root did not expire from shared trust")
	}
	assertTLSWithCurrentBundle(t, client, firstServer.URL)
	assertTLSWithCurrentBundle(t, client, secondServer.URL)
}

func dynamicTLSServer(manager *ServingManager) *httptest.Server {
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) }))
	server.TLS = &tls.Config{GetCertificate: manager.GetCertificate, MinVersion: tls.VersionTLS12}
	server.StartTLS()
	return server
}

func assertTLSWithCurrentBundle(t *testing.T, client *fake.Clientset, url string) {
	t.Helper()
	configuration, err := client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Get(context.Background(), "uds-controller-pods", metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(configuration.Webhooks[0].ClientConfig.CABundle) {
		t.Fatal("invalid published trust")
	}
	transport := &http.Transport{TLSClientConfig: &tls.Config{RootCAs: roots, ServerName: "uds-controller.uds-system.svc", MinVersion: tls.VersionTLS12}, DisableKeepAlives: true}
	defer transport.CloseIdleConnections()
	response, err := (&http.Client{Transport: transport, Timeout: time.Second}).Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, response.Body)
	if response.StatusCode != http.StatusOK {
		t.Fatal(response.Status)
	}
}

func TestStoppedAdmissionCannotReturnAllow(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	handler := fenceAdmissions(ctx, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(`{"allowed":true}`)); cancel() }))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/validate-pods", nil))
	if response.Code != http.StatusServiceUnavailable || bytes.Contains(response.Body.Bytes(), []byte(`"allowed":true`)) {
		t.Fatal("stopped authority returned allow")
	}
}
