// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"encoding/json"
	"fmt"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"testing"
)

func TestRestoreUsesOneExactPublicationSnapshotWithoutPerRecordGets(t *testing.T) {
	m, kube, _, _ := managementFixture(t)
	for index := 0; index < 40; index++ {
		record := ClientRecord{Realm: "uds", Data: map[string]any{"id": fmt.Sprint(index), "clientId": fmt.Sprintf("app-%d", index), "publicClient": false, "secret": "real-secret"}}
		if err := m.Store.Put(t.Context(), "client", recordKey(record), record); err != nil {
			t.Fatal(err)
		}
	}
	if err := m.Clients.Restore(t.Context()); err != nil {
		t.Fatal(err)
	}
	kube.ClearActions()
	if err := m.Clients.Restore(t.Context()); err != nil {
		t.Fatal(err)
	}
	lists, publicationGets, writes := 0, 0, 0
	for _, a := range kube.Actions() {
		if a.GetResource().Resource != "secrets" {
			continue
		}
		if a.GetVerb() == "list" {
			lists++
		}
		if a.GetVerb() == "get" {
			raw, _ := json.Marshal(a)
			var field map[string]any
			_ = json.Unmarshal(raw, &field)
			if name, _ := field["Name"].(string); len(name) > 23 && name[:23] == "uds-native-publication-" {
				publicationGets++
			}
		}
		if a.GetVerb() == "create" || a.GetVerb() == "update" || a.GetVerb() == "delete" {
			writes++
		}
	}
	if lists != 2 || publicationGets != 0 || writes != 0 {
		t.Fatal("unchanged restore repeated owned API reads/writes", lists, publicationGets, writes)
	}
}
func TestPublicationBatchDoesNotAcceptForeignOrCorruptAcknowledgement(t *testing.T) {
	m, kube, public, admin := managementFixture(t)
	record := ClientRecord{Realm: "uds", Data: map[string]any{"id": "owned", "clientId": "owned", "publicClient": false, "secret": "secret"}}
	if err := m.Clients.Save(t.Context(), record); err != nil {
		t.Fatal(err)
	}
	key := stateName("publication", recordKey(record))
	secret, err := kube.CoreV1().Secrets("identity").Get(t.Context(), key, metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if err := kube.CoreV1().Secrets("identity").Delete(t.Context(), key, metav1.DeleteOptions{}); err != nil {
		t.Fatal(err)
	}
	secret.Name = "foreign-publication-key"
	secret.ResourceVersion = ""
	secret.UID = ""
	if _, err := kube.CoreV1().Secrets("identity").Create(t.Context(), secret, metav1.CreateOptions{}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := m.Clients.PublishedClient(t.Context(), "uds", "owned"); err == nil {
		t.Fatal("foreign marker acknowledged current authority")
	}
	// A failed second issuer cannot publish a missing marker from the list.
	failing := &unavailableDex{DexClients: admin, fail: true}
	m.Clients.dex = []DexClients{public, failing}
	if err := m.Clients.Restore(t.Context()); err == nil {
		t.Fatal("second issuer failure reported success")
	}
	if _, _, err := m.Clients.PublishedClient(t.Context(), "uds", "owned"); err == nil {
		t.Fatal("partial repair released authority")
	}
	failing.fail = false
	if err := m.Clients.Restore(t.Context()); err != nil {
		t.Fatal(err)
	}
	secret, err = kube.CoreV1().Secrets("identity").Get(t.Context(), key, metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	secret.Data["state.json"] = []byte("corrupt-publication")
	if _, err := kube.CoreV1().Secrets("identity").Update(t.Context(), secret, metav1.UpdateOptions{}); err != nil {
		t.Fatal(err)
	}
	if err := m.Clients.Restore(t.Context()); err == nil {
		t.Fatal("corrupt acknowledgement silently accepted")
	}
	if _, _, err := m.Clients.PublishedClient(t.Context(), "uds", "owned"); err == nil {
		t.Fatal("corrupt marker granted token")
	}
}
