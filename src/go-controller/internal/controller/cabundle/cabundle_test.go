// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package cabundle

import (
	"context"
	"encoding/base64"
	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
	"testing"
)

func TestAllCertificateSourcesAndMalformedInput(t *testing.T) {
	prior := config.Get()
	t.Cleanup(func() { config.Replace(prior) })
	encode := func(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }
	config.Replace(config.Config{CABundle: config.CABundle{Certs: encode("user"), DoDCerts: encode("dod"), PublicCerts: encode("public"), IncludeDoDCerts: true, IncludePublicCerts: true}})
	got, err := BuildContent()
	if err != nil || got != "user\n\ndod\n\npublic" {
		t.Fatalf("wrong bundle %q: %v", got, err)
	}
	config.Update(func(c *config.Config) { c.CABundle.Certs = "invalid!" })
	if _, err := BuildContent(); err == nil {
		t.Fatal("malformed source silently dropped")
	}
}
func TestDefaultBundleMultiPackageOwnershipAndEmptyCleanup(t *testing.T) {
	ctx := context.Background()
	prior := config.Get()
	t.Cleanup(func() { config.Replace(prior) })
	config.Replace(config.Config{CABundle: config.CABundle{Certs: base64.StdEncoding.EncodeToString([]byte("trust"))}})
	client := fake.NewClientset()
	a := &udstypes.UDSPackage{ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "apps", UID: "a", Generation: 1}}
	b := &udstypes.UDSPackage{ObjectMeta: metav1.ObjectMeta{Name: "b", Namespace: "apps", UID: "b", Generation: 1}}
	for _, pkg := range []*udstypes.UDSPackage{a, b, a, b} {
		if err := Reconcile(ctx, client.CoreV1(), pkg, "apps"); err != nil {
			t.Fatal(err)
		}
	}
	cm, err := client.CoreV1().ConfigMaps("apps").Get(ctx, "uds-trust-bundle", metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if len(cm.OwnerReferences) != 2 || cm.Data["ca-bundle.pem"] != "trust" {
		t.Fatal("second Package overwrote default trust ownership")
	}
	config.Replace(config.Config{})
	if err := Reconcile(ctx, client.CoreV1(), a, "apps"); err != nil {
		t.Fatal(err)
	}
	remaining, err := client.CoreV1().ConfigMaps("apps").Get(ctx, "uds-trust-bundle", metav1.GetOptions{})
	if err != nil || len(remaining.OwnerReferences) != 1 || remaining.OwnerReferences[0].UID != b.UID || remaining.Data["ca-bundle.pem"] != "trust" {
		t.Fatalf("one Package cleanup removed another's trust: %v", err)
	}
	if err := Reconcile(ctx, client.CoreV1(), b, "apps"); err != nil {
		t.Fatal(err)
	}
	cms, _ := client.CoreV1().ConfigMaps("apps").List(ctx, metav1.ListOptions{})
	if len(cms.Items) != 0 {
		t.Fatal("empty global trust retained stale bundle")
	}
}
