// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"k8s.io/client-go/kubernetes/fake"
	"testing"
)

func TestDirectorySurvivesProcessRecreationAndUserRevocation(t *testing.T) {
	ctx := context.Background()
	client := fake.NewSimpleClientset()
	first := NewKubeDirectory(client.CoreV1().Secrets("identity"))
	user, err := testDirectory(t).Authenticate(ctx, "doug", "test-password")
	if err != nil {
		t.Fatal(err)
	}
	if err := first.Save(ctx, user); err != nil {
		t.Fatal(err)
	}
	replacement := NewKubeDirectory(client.CoreV1().Secrets("identity"))
	if _, err := replacement.Authenticate(ctx, "doug", "test-password"); err != nil {
		t.Fatal("process recreation lost user", err)
	}
	user.Enabled = false
	if err := replacement.Save(ctx, user); err != nil {
		t.Fatal(err)
	}
	if _, err := replacement.Authenticate(ctx, "doug", "test-password"); err == nil {
		t.Fatal("disabled identity authenticated")
	}
	if _, err := replacement.Get(ctx, user.ID); err == nil {
		t.Fatal("refresh accepted disabled identity")
	}
	if err := replacement.Delete(ctx, user.ID); err != nil {
		t.Fatal(err)
	}
	users, err := replacement.List(ctx)
	if err != nil || len(users) != 0 {
		t.Fatal("user deletion left directory state")
	}
}
