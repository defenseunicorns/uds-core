// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
// Checks a pure Helm render without printing serving Secret contents.
import { readFileSync } from "node:fs";
import { parseAllDocuments } from "yaml";
import { strict as assert } from "node:assert";
const objects=parseAllDocuments(readFileSync(process.argv[2],"utf8")).map(d=>d.toJSON()).filter(Boolean);
const configs=objects.filter(o=>o.kind.endsWith("WebhookConfiguration"));
const secret=objects.find(o=>o.kind==="Secret"&&o.metadata.name==="uds-controller-serving-certificate");
const callbacks=configs.flatMap(o=>o.webhooks);
const narrow=process.argv[3]==="narrow";
assert.equal(callbacks.length,9,"complete registration changed");
assert(callbacks.every(w=>w.clientConfig.caBundle===secret.data["ca.crt"]),"callbacks did not share one CA");
const primary=["validate-pods.uds.dev","mutate-pods.uds.dev","validate-resources.uds.dev"];
for(const name of primary){
 const entry=callbacks.find(w=>w.name===name);
 assert.deepEqual([...entry.namespaceSelector.matchExpressions[0].values].sort(),["kube-system","pepr-system","istio-system","zarf"].sort());
 assert.equal(entry.namespaceSelector.matchExpressions[0].operator,"NotIn");
}
for(const name of ["validate-pods-istio-system.uds.dev","mutate-pods-istio-system.uds.dev","validate-resources-istio-system.uds.dev"]){
 const entry=callbacks.find(w=>w.name===name);
 assert.equal(entry.namespaceSelector.matchExpressions[0].operator,"In");
 assert.deepEqual(entry.namespaceSelector.matchExpressions[0].values,["istio-system"]);
 assert.equal(entry.failurePolicy,"Fail");
}
const resources=callbacks.find(w=>w.name==="validate-resources-istio-system.uds.dev");
assert.deepEqual(resources.rules[0].resources,["packages","exemptions"]);
assert.equal(resources.rules[0].scope,"Namespaced");
for(const name of ["pods.waypoint.uds.dev","services.waypoint.uds.dev"]){
 const entry=callbacks.find(w=>w.name===name);
 assert.deepEqual(entry.rules[0].operations,["CREATE","UPDATE"],"source topology mutation must also enforce updates");
}
const routing=JSON.parse(readFileSync(new URL("./routing.json",import.meta.url),"utf8"));
for(const name of ["validate-pods.uds.dev","validate-pods-istio-system.uds.dev","mutate-pods.uds.dev","mutate-pods-istio-system.uds.dev"]){
 const entry=callbacks.find(w=>w.name===name);
 const condition=entry.matchConditions.find(c=>c.name==="native-requires-go");
 assert.equal(Boolean(condition),narrow,"callback narrowing changed without qualification mode");
 if(narrow)assert.equal(condition.expression,routing[name.startsWith("mutate")?"mutate":"validate"],"static routing differs from protected native contract");
}
if(!narrow){
 const staticCallbacks=["webhook.yaml","mutatingwebhook.yaml","mutating-webhook.yaml"].flatMap(file=>parseAllDocuments(readFileSync(new URL("../manifests/"+file,import.meta.url),"utf8")).map(d=>d.toJSON()));
 for(const config of configs){
  const expected=structuredClone(config);
  for(const webhook of expected.webhooks)webhook.clientConfig.caBundle="";
  assert.deepEqual(staticCallbacks.find(o=>o.kind===config.kind&&o.metadata.name===config.metadata.name),expected,"standalone callback registration drifted from enforcing chart");
 }
 const recovery=parseAllDocuments(readFileSync(new URL("../manifests/native-recovery.yaml",import.meta.url),"utf8"))[0].toJSON();
 assert.equal(recovery.items.length,6,"standalone mandatory recovery safety is incomplete");
}
const native=JSON.parse(readFileSync(new URL("./policies.json",import.meta.url),"utf8"));
for(const binding of native.items.filter(o=>o.kind.endsWith("Binding"))){
 const excluded=binding.spec.matchResources.namespaceSelector.matchExpressions[0].values;
 for(const namespace of ["kube-system","pepr-system","zarf"])assert(excluded.includes(namespace));
 assert(!excluded.includes("istio-system"),"native Istio admission was lost");
 if(binding.metadata.name.includes("controller-"))assert(!excluded.includes("uds-system"),"recovery enforcement was lost");
}
console.log(JSON.stringify({callbacks:callbacks.length,sharedCA:true,sourceSystemNamespaceBoundary:true,istioValidationPreserved:true,recoveryEnforced:true,narrowCallbacks:narrow,standaloneParity:!narrow}));
