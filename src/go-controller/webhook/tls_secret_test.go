// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"bytes"
	"context"
	"crypto/x509"
	"k8s.io/client-go/kubernetes/fake"
	"sync"
	"testing"
)

func TestServingCertificateIsSharedAcrossConcurrentReplicas(t *testing.T) {
	client := fake.NewSimpleClientset()
	var workers sync.WaitGroup
	roots := make(chan []byte, 8)
	errors := make(chan error, 8)
	for i := 0; i < 8; i++ {
		workers.Go(func() {
			pair, ca, err := sharedServingCertificate(context.Background(), client)
			if err == nil {
				var leaf *x509.Certificate
				leaf, err = x509.ParseCertificate(pair.Certificate[0])
				if err == nil {
					err = leaf.VerifyHostname("uds-controller.uds-system.svc")
				}
			}
			if err != nil {
				errors <- err
				return
			}
			roots <- ca
		})
	}
	workers.Wait()
	close(roots)
	close(errors)
	for err := range errors {
		t.Error(err)
	}
	var first []byte
	count := 0
	for root := range roots {
		count++
		if first == nil {
			first = root
		}
		if !bytes.Equal(first, root) {
			t.Fatal("replicas selected different serving roots")
		}
	}
	if count != 8 {
		t.Fatalf("only %d replicas received valid certificates", count)
	}
}
