// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func sourceMutations(t *testing.T) []map[string]interface{} {
	t.Helper()
	_, filename, _, _ := runtime.Caller(0)
	data, err := os.ReadFile(filepath.Join(filepath.Dir(filename), "../../../src/go-controller/native-admission/policies.json"))
	if err != nil {
		t.Fatal(err)
	}
	var list struct{ Items []map[string]interface{} }
	if err := json.Unmarshal(data, &list); err != nil {
		t.Fatal(err)
	}
	var objects []map[string]interface{}
	for _, obj := range list.Items {
		if strings.HasPrefix(obj["kind"].(string), "MutatingAdmission") {
			objects = append(objects, obj)
		}
	}
	return objects
}

func TestMutationBootstrapCannotAdvanceValidationOrLosePolicyPairs(t *testing.T) {
	for _, mode := range []string{"current-source", "validating-policy", "unserved-api", "duplicate", "missing-pair", "binding-target"} {
		t.Run(mode, func(t *testing.T) {
			objects := sourceMutations(t)
			switch mode {
			case "validating-policy":
				objects[0]["kind"] = "ValidatingAdmissionPolicy"
			case "unserved-api":
				objects[0]["apiVersion"] = "admissionregistration.k8s.io/v1beta1"
			case "duplicate":
				objects[2] = objects[0]
			case "missing-pair":
				objects = objects[:len(objects)-1]
			case "binding-target":
				mapAt(objects[1], "spec")["policyName"] = "foreign-policy"
			}
			data, err := json.Marshal(map[string]interface{}{"items": objects})
			if err != nil {
				t.Fatal(err)
			}
			_, err = mutationObjects(data)
			if (err == nil) != (mode == "current-source") {
				t.Fatalf("%s was not fenced correctly: %v", mode, err)
			}
		})
	}
}

func TestMutationBootstrapWaitsForObservedCurrentRevision(t *testing.T) {
	attempts := 0
	fakeKube(t, func(input interface{}, args ...string) ([]byte, error) {
		if args[0] == "get" {
			return []byte(`{"spec":{"valid":true,"revision":"current-revision"}}`), nil
		}
		attempts++
		switch attempts {
		case 1:
			return []byte(`{"metadata":{}}`), nil // Policy informer has not observed the new MAP.
		case 2:
			return nil, errors.New("policy activation in progress")
		case 3:
			return []byte(`{"metadata":{"annotations":{"policy.uds.dev/native-mutation-revision":"old-revision"}}}`), nil
		default:
			return []byte(`{"metadata":{"annotations":{"policy.uds.dev/native-mutation-revision":"current-revision"}}}`), nil
		}
	})
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := waitMutationCanary(ctx, time.Millisecond); err != nil {
		t.Fatal(err)
	}
	if attempts != 4 {
		t.Fatalf("advanced before current native mutation authority was observed: %d attempts", attempts)
	}
}

func TestMutationBootstrapCannotTrustMissingOrInvalidAuthority(t *testing.T) {
	for _, spec := range []string{`{}`, `{"valid":false,"revision":"current"}`, `{"valid":true,"revision":"bootstrap-empty"}`} {
		t.Run(spec, func(t *testing.T) {
			fakeKube(t, func(input interface{}, args ...string) ([]byte, error) {
				if args[0] == "get" {
					return []byte(`{"spec":` + spec + `}`), nil
				}
				return []byte(`{"metadata":{"annotations":{"policy.uds.dev/native-mutation-revision":"current"}}}`), nil
			})
			if err := mutationCanary(); err == nil {
				t.Fatal("invalid compiler authority opened the activation gate")
			}
		})
	}
}

func TestCancelledMutationGateDoesNotCreateAnotherCanary(t *testing.T) {
	fakeKube(t, func(input interface{}, args ...string) ([]byte, error) {
		t.Fatal("cancelled activation performed another API request")
		return nil, nil
	})
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := waitMutationCanary(ctx, time.Millisecond); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation lost: %v", err)
	}
}

func TestMutationBootstrapUsesPinnedHelmOwnershipWithoutForce(t *testing.T) {
	objects := sourceMutations(t)
	calls := 0
	fakeKube(t, func(input interface{}, args ...string) ([]byte, error) {
		calls++
		if strings.Join(args, " ") != "apply --server-side --field-manager=zarf -f -" {
			t.Fatalf("bootstrap cannot safely hand API-defaulted ownership to Helm: %v", args)
		}
		// Compare JSON to prove the helper changes ownership transport without
		// changing enforcement content.
		got, _ := json.Marshal(input)
		want, _ := json.Marshal(objects[0])
		if string(got) != string(want) {
			t.Fatal("bootstrap changed canonical policy content")
		}
		return []byte("applied"), nil
	})
	if err := applyMutationBootstrap(objects[0]); err != nil {
		t.Fatal(err)
	}
	if calls != 1 {
		t.Fatal("unexpected extra authority requests")
	}
}
