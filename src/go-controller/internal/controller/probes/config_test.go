// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package probes

import (
	"context"
	"encoding/json"
	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
	"testing"
)

func TestBlackboxModulesAreOwnedPerPackage(t *testing.T) {
	ctx := context.Background()
	client := fake.NewClientset()
	a := &udstypes.UDSPackage{ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "apps", UID: "a"}}
	b := &udstypes.UDSPackage{ObjectMeta: metav1.ObjectMeta{Name: "b", Namespace: "apps", UID: "b"}}
	if err := updateBlackboxConfig(ctx, client, a, map[string]string{"a-probe": "secret-a"}); err != nil {
		t.Fatal(err)
	}
	if err := updateBlackboxConfig(ctx, client, b, map[string]string{"b-probe": "secret-b"}); err != nil {
		t.Fatal(err)
	}
	if err := Cleanup(ctx, client, b); err != nil {
		t.Fatal(err)
	}
	secret, err := client.CoreV1().Secrets("monitoring").Get(ctx, blackboxSecret, metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal(secret.Data["blackbox.yaml"], &cfg); err != nil {
		t.Fatal(err)
	}
	modules := cfg["modules"].(map[string]interface{})
	if modules[moduleName("apps", "a-probe")] == nil || modules[moduleName("apps", "b-probe")] != nil || modules["http_2xx"] == nil {
		t.Fatalf("one Package erased another's probe module: %v", modules)
	}
}
