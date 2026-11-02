// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package webhook

import (
	"bytes"
	"context"
	"encoding/base64"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestLiveHelmPreservesControllerRenewal(t *testing.T) {
	path, cli := os.Getenv("UDS_SERVING_TEST_KUBECONFIG"), os.Getenv("UDS_TRANSITION_TEST_CLI")
	if path == "" || cli == "" {
		t.Skip("requires an explicit disposable-cluster kubeconfig and UDS CLI")
	}
	cfg, err := clientcmd.BuildConfigFromFlags("", path)
	if err != nil {
		t.Fatal(err)
	}
	client, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	// Refuse to reuse an existing Core namespace; this test owns only what it creates.
	ns, err := client.CoreV1().Namespaces().Create(ctx, &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: servingNamespace}}, metav1.CreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		cleanup, stop := context.WithTimeout(context.Background(), 20*time.Second)
		defer stop()
		if err := client.CoreV1().Namespaces().Delete(cleanup, ns.Name, metav1.DeleteOptions{Preconditions: &metav1.Preconditions{UID: &ns.UID}}); err != nil {
			t.Error(err)
		}
	}()
	old, oldCA, err := generateSelfSignedCertAt(time.Now().Add(-300 * 24 * time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	key, err := privateKeyPEM(old)
	if err != nil {
		t.Fatal(err)
	}
	secret, err := client.CoreV1().Secrets(ns.Name).Create(ctx, &corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: servingSecretName}, Type: corev1.SecretTypeTLS, Data: map[string][]byte{"tls.crt": oldCA, "tls.key": key, "ca.crt": oldCA}}, metav1.CreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	manager, err := newServingManager(ctx, client)
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	renewed, err := client.CoreV1().Secrets(ns.Name).Get(ctx, secret.Name, metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if renewed.UID != secret.UID || bytes.Equal(renewed.Data["ca.crt"], oldCA) {
		t.Fatal("renewal did not preserve Secret identity and replace due certificate")
	}
	chart := t.TempDir()
	if err := os.Mkdir(filepath.Join(chart, "templates"), 0700); err != nil {
		t.Fatal(err)
	}
	write := func(name string, data []byte) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(chart, name), data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	write("Chart.yaml", []byte("apiVersion: v2\nname: renewal-test\nversion: 0.0.1\n"))
	for _, name := range []string{"_admission-serving.tpl", "serving-certificate.yaml"} {
		data, err := os.ReadFile(filepath.Join("../chart/templates", name))
		if err != nil {
			t.Fatal(err)
		}
		write("templates/"+name, data)
	}
	write("templates/probe.yaml", []byte("apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: trust-probe\ndata:\n  ca: {{ include \"uds.admission.caBundle\" . | quote }}\n"))
	command := exec.CommandContext(ctx, cli, "zarf", "tools", "helm", "template", "renewal-test", chart, "--namespace", ns.Name, "--dry-run=server", "--kubeconfig", path)
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("Helm lookup render failed: %v: %s", err, output)
	}
	bundle := base64.StdEncoding.EncodeToString(append(bytes.Clone(renewed.Data["ca.crt"]), oldCA...))
	if strings.Contains(string(output), "kind: Secret") || !strings.Contains(string(output), bundle) {
		t.Fatal("Helm attempted a competing identity write or lost overlapping trust")
	}
	t.Log("real Kubernetes renewal preserved Secret UID; Helm server-side lookup preserved overlapping CA bundle without rendering a replacement Secret")
}
