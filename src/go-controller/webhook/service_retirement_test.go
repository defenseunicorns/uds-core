// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package webhook

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/store"
	"github.com/google/cel-go/cel"
	admissionv1 "k8s.io/api/admission/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func retiringService() (map[string]interface{}, map[string]interface{}) {
	old := repairedTopologyObject("Service", guardObject("Service", "demo"))
	old["spec"].(map[string]interface{})["type"] = "NodePort"
	current := cloneMap(old)
	delete(topologyLabels(current), "istio.io/use-waypoint")
	delete(topologyLabels(current), "istio.io/ingress-use-waypoint")
	return old, current
}

func TestRevokedServiceExemptionCannotDeadlockOwnedWaypointRetirement(t *testing.T) {
	pkg := guardPackage("owner", "Removing", "demo")
	now := metav1.Now()
	pkg.SetDeletionTimestamp(&now)
	informer, ws := topologyInformer(t, pkg), store.NewWaypointStore()
	old, current := retiringService()
	for _, mutate := range []bool{false, true} {
		handler := topologyPolicyHandler(NewExemptionStore(), mutate, ws, informer)
		result := guardAdmission(t, handler, "Service", admissionv1.Update, topologyControllerActor, current, old)
		if !result.Allowed || len(result.Patch) != 0 {
			t.Fatal("owned metadata retirement blocked after exemption revocation", mutate, result)
		}
	}
	validate := topologyPolicyHandler(NewExemptionStore(), false, ws, informer)
	if guardAdmission(t, validate, "Service", admissionv1.Update, "tenant", current, old).Allowed {
		t.Fatal("tenant bypassed Service policy")
	}
	changes := []func(map[string]interface{}){
		func(o map[string]interface{}) {
			o["spec"].(map[string]interface{})["externalIPs"] = []interface{}{"192.0.2.1"}
		},
		func(o map[string]interface{}) { topologyLabels(o)["app"] = "other" },
		func(o map[string]interface{}) { topologyLabels(o)["istio.io/use-waypoint"] = "other" },
		func(o map[string]interface{}) {
			o["metadata"].(map[string]interface{})["annotations"] = map[string]interface{}{"unrelated": "change"}
		},
		func(o map[string]interface{}) { o["metadata"].(map[string]interface{})["uid"] = "replacement" },
	}
	for _, change := range changes {
		invalid := cloneMap(current)
		change(invalid)
		if guardAdmission(t, validate, "Service", admissionv1.Update, topologyControllerActor, invalid, old).Allowed {
			t.Fatal("non-retirement change bypassed Service policy", invalid)
		}
	}
	withoutOwner := topologyPolicyHandler(NewExemptionStore(), false, ws, topologyInformer(t, nil))
	if guardAdmission(t, withoutOwner, "Service", admissionv1.Update, topologyControllerActor, current, old).Allowed {
		t.Fatal("uncorrelated route retirement bypassed Service policy")
	}
}

func TestNativeServiceRetirementOnlyDelegatesExactMetadataReduction(t *testing.T) {
	raw, err := os.ReadFile("../native-admission/routing.json")
	if err != nil {
		t.Fatal(err)
	}
	var routing map[string]string
	if err := json.Unmarshal(raw, &routing); err != nil {
		t.Fatal(err)
	}
	env, err := cel.NewEnv(cel.Variable("object", cel.DynType), cel.Variable("oldObject", cel.DynType), cel.Variable("request", cel.DynType))
	if err != nil {
		t.Fatal(err)
	}
	ast, issues := env.Compile(routing["workloadRetirement"])
	if issues.Err() != nil {
		t.Fatal(issues.Err())
	}
	program, err := env.Program(ast)
	if err != nil {
		t.Fatal(err)
	}
	old, current := retiringService()
	request := map[string]interface{}{"operation": "UPDATE", "resource": map[string]interface{}{"group": "", "resource": "services"}, "subResource": "", "userInfo": map[string]interface{}{"username": topologyControllerActor}}
	eval := func(object map[string]interface{}) bool {
		value, _, err := program.Eval(map[string]interface{}{"object": object, "oldObject": old, "request": request})
		if err != nil {
			t.Fatal(err)
		}
		return value.Value() == true
	}
	if !eval(current) {
		t.Fatal("exact retirement not routed to Go")
	}
	invalid := cloneMap(current)
	invalid["spec"].(map[string]interface{})["externalIPs"] = []interface{}{"192.0.2.1"}
	if eval(invalid) {
		t.Fatal("Service spec mutation delegated")
	}
	request["userInfo"] = map[string]interface{}{"username": "tenant"}
	if eval(current) {
		t.Fatal("tenant delegated")
	}
	request["userInfo"] = map[string]interface{}{"username": topologyControllerActor}
	request["operation"] = "CREATE"
	if eval(current) {
		t.Fatal("creation delegated")
	}
	request["operation"] = "UPDATE"
	request["resource"] = map[string]interface{}{"group": "", "resource": "pods"}
	old = repairedTopologyObject("Pod", guardObject("Pod", "demo"))
	current = cloneMap(old)
	delete(topologyLabels(current), "istio.io/use-waypoint")
	if !eval(current) {
		t.Fatal("exact Pod retirement not routed to owner-aware Go")
	}
	current["spec"].(map[string]interface{})["hostNetwork"] = true
	if eval(current) {
		t.Fatal("Pod spec change delegated")
	}
}

func TestRevokedPodExemptionCannotDeadlockOwnedWaypointRetirement(t *testing.T) {
	pkg := guardPackage("owner", "Removing", "demo")
	now := metav1.Now()
	pkg.SetDeletionTimestamp(&now)
	old := repairedTopologyObject("Pod", guardObject("Pod", "demo"))
	old["spec"].(map[string]interface{})["securityContext"] = map[string]interface{}{"runAsUser": float64(0), "runAsNonRoot": false}
	current := cloneMap(old)
	delete(topologyLabels(current), "istio.io/use-waypoint")
	ws, informer := store.NewWaypointStore(), topologyInformer(t, pkg)
	for _, mutate := range []bool{false, true} {
		handler := topologyPolicyHandler(NewExemptionStore(), mutate, ws, informer)
		result := guardAdmission(t, handler, "Pod", admissionv1.Update, topologyControllerActor, current, old)
		if !result.Allowed || len(result.Patch) != 0 {
			t.Fatal("unchanged Pod spec blocked owned retirement", result)
		}
	}
	validate := topologyPolicyHandler(NewExemptionStore(), false, ws, informer)
	if guardAdmission(t, validate, "Pod", admissionv1.Update, "tenant", current, old).Allowed {
		t.Fatal("tenant bypassed Pod policy")
	}
	changed := cloneMap(current)
	changed["spec"].(map[string]interface{})["hostNetwork"] = true
	if guardAdmission(t, validate, "Pod", admissionv1.Update, topologyControllerActor, changed, old).Allowed {
		t.Fatal("spec change bypassed Pod policy")
	}
}
