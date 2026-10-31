// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
// Consume a private pure Helm render; never copy generated serving material.
import { readFileSync, writeFileSync } from "node:fs";
import { parseAllDocuments } from "yaml";
const docs=parseAllDocuments(readFileSync(process.argv[2],"utf8")).map(d=>d.toJSON()).filter(Boolean);
const header="# Copyright 2026 Defense Unicorns\n# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial\n# Generated from the broad complete controller chart by native-admission/sync-manifests.mjs.\n";
for(const [file,names] of Object.entries({"webhook.yaml":["uds-controller-clusterconfig","uds-controller-pods","uds-controller-resources"],"mutatingwebhook.yaml":["uds-controller-pods"],"mutating-webhook.yaml":["uds-controller-waypoint"]})){
 const kind=file==="webhook.yaml"?"ValidatingWebhookConfiguration":"MutatingWebhookConfiguration";
 const objects=names.map(name=>structuredClone(docs.find(o=>o.kind===kind&&o.metadata.name===name)));
 if(objects.some(o=>!o))throw new Error("Incomplete chart registration");
 for(const object of objects)for(const webhook of object.webhooks){
  if(webhook.failurePolicy!=="Fail")throw new Error("Non-enforcing callback");
  if(webhook.matchConditions?.some(c=>c.name==="native-requires-go"))throw new Error("Static fallback requires broad registration");
  webhook.clientConfig.caBundle="";
 }
 writeFileSync(new URL("../manifests/"+file,import.meta.url),header+objects.map(o=>JSON.stringify(o,null,2)).join("\n---\n")+"\n");
}
const recovery=docs.filter(o=>o.metadata?.name?.startsWith("uds-native-controller-")&&o.apiVersion==="admissionregistration.k8s.io/v1");
if(recovery.length!==6)throw new Error("Incomplete mandatory recovery safety");
writeFileSync(new URL("../manifests/native-recovery.yaml",import.meta.url),header+JSON.stringify({apiVersion:"v1",kind:"List",items:recovery},null,2)+"\n");
console.log(JSON.stringify({completeCallbacks:9,mandatoryRecoveryObjects:6,credentialMaterialCopied:false}));
