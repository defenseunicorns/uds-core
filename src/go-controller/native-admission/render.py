#!/usr/bin/env python3
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

"""Render native Core admission; the Go webhook must be present for delegation.

CEL owns simple checks, safe defaults, marker annotations and monitoring defaults.
Go owns registry/image classification, ECMAScript numeric label conversion, prior
JSON diagnostic arrays, JavaScript-only regex scopes and advanced CRD validation.
Delegation never trusts tenant-provided skip annotations or labels.
"""
import copy
import json
from pathlib import Path
import bootstrap
import routing

ROOT = Path(__file__).resolve().parent
PARAM_KIND = {"apiVersion": "policy.uds.dev/v1alpha1", "kind": "AdmissionParameters"}
POD_POLICIES = ["DisallowHostNamespaces", "RestrictHostPorts", "DisallowPrivileged",
                "RequireNonRootUser", "RestrictProcMount", "RestrictSeccomp",
                "DisallowSELinuxOptions", "RestrictSELinuxType", "DropAllCapabilities",
                "RestrictCapabilities", "RestrictVolumeTypes", "RestrictHostPathWrite",
                "RestrictIstioSidecarOverrides", "RestrictIstioTrafficOverrides",
                "RestrictIstioAmbientOverrides", "RestrictIstioUser"]
SERVICE_POLICIES = ["RestrictExternalNames", "DisallowNodePortServices"]
SELECTOR = {"matchPolicy": "Equivalent", "objectSelector": {}, "namespaceSelector": {"matchExpressions": [{"key": "kubernetes.io/metadata.name", "operator": "NotIn", "values": ["kube-system", "pepr-system", "zarf"]}]}}
CONTAINERS = "object.spec.containers + (has(object.spec.initContainers) ? object.spec.initContainers : []) + (has(object.spec.ephemeralContainers) ? object.spec.ephemeralContainers : [])"


def exemption(policy):
    return "variables.resourceNamePresent && params.spec.nativeMatchers.exists(m, m.policy == " + json.dumps(policy) + " && m.namespace == request.namespace && variables.resourceName.matches(m.pattern))"


def legacy(policy):
    return "params.spec.legacyScopes.exists(m, m.policy == " + json.dumps(policy) + " && m.namespace == request.namespace)"


def grant_variables(policies):
    mutation_revision = "has(object.metadata.annotations) && " + json.dumps(routing.MUTATION_REVISION) + " in object.metadata.annotations && object.metadata.annotations[" + json.dumps(routing.MUTATION_REVISION) + "] == params.spec.revision"
    return [{"name": "resourceName", "expression": "has(object.metadata.name) && object.metadata.name != '' ? object.metadata.name : (has(object.metadata.generateName) ? object.metadata.generateName : '')"}, {"name": "resourceNamePresent", "expression": "(has(object.metadata.name) && object.metadata.name != '') || has(object.metadata.generateName)"}, {"name": "fallbackReady", "expression": "(" + routing.PRESENT + ") && object.metadata.annotations[" + json.dumps(routing.ANNOTATION) + "] == params.spec.revision"}, {"name": "mutationReady", "expression": mutation_revision}] + [{"name": "grant" + policy, "expression": exemption(policy)} for policy in policies] + [{"name": "legacy" + policy, "expression": legacy(policy)} for policy in policies]


def guard(policy, validating=False):
    legacy_expression = "variables.legacy" + policy
    if validating:
        legacy_expression = "(" + legacy_expression + " && variables.fallbackReady)"
    return "variables.grant" + policy + " || " + legacy_expression


def fallback_marker(policies, pod=False):
    needs_go = " || ".join("variables.legacy" + policy for policy in policies)
    if pod:
        needs_go += " || variables.diagnosticNeedsGo"
    present = "has(object.metadata.annotations) && " + json.dumps(routing.ANNOTATION) + " in object.metadata.annotations"
    ensure = "!has(object.metadata.annotations) ? [JSONPatch{op:'add',path:'/metadata/annotations',value:{}}] : []"
    add = "[JSONPatch{op:'add',path:" + json.dumps(annotation_path(routing.ANNOTATION)) + ",value:params.spec.revision}]"
    remove = "[JSONPatch{op:'remove',path:" + json.dumps(annotation_path(routing.ANNOTATION)) + "}]"
    return {"patchType": "JSONPatch", "jsonPatch": {"expression": "(" + needs_go + ") ? (" + ensure + ")+" + add + " : ((" + present + ") ? " + remove + " : [])"}}


def mutation_revision():
    ensure = "!has(object.metadata.annotations) ? [JSONPatch{op:'add',path:'/metadata/annotations',value:{}}] : []"
    patch = "[JSONPatch{op:'add',path:" + json.dumps(annotation_path(routing.MUTATION_REVISION)) + ",value:params.spec.revision}]"
    return {"patchType": "JSONPatch", "jsonPatch": {"expression": "(" + ensure + ")+" + patch}}


def annotation_path(key):
    return "/metadata/annotations/" + key.replace("~", "~0").replace("/", "~1")


def markers(policies):
    changes = []
    for policy in policies:
        key = "uds-core.pepr.dev/uds-core-policies." + policy
        present = "has(object.metadata.annotations) && " + json.dumps(key) + " in object.metadata.annotations"
        add = "[JSONPatch{op:'add',path:" + json.dumps(annotation_path(key)) + ",value:'exempted'}]"
        remove = "[JSONPatch{op:'remove',path:" + json.dumps(annotation_path(key)) + "}]"
        changes.append("(variables.grant" + policy + " ? " + add + " : (!variables.legacy" + policy + " && (" + present + ") ? " + remove + " : []))")
    has_grant = " || ".join("variables.grant" + policy for policy in policies)
    ensure = "(!has(object.metadata.annotations) && (" + has_grant + ") ? [JSONPatch{op:'add',path:'/metadata/annotations',value:{}}] : [])"
    return {"patchType": "JSONPatch", "jsonPatch": {"expression": ensure + "+" + "+".join(changes)}}


def defaults(policy):
    skip = guard(policy) + " || variables.diagnosticNeedsGo || variables.identityLabels"
    if policy == "RequireNonRootUser":
        # parseInt accepts decimal prefixes, hex, whitespace and produces NaN for
        # malformed values. A plain CEL int conversion is not the same contract.
        fields = {"runAsNonRoot": "true", "runAsUser": "1000", "runAsGroup": "1000"}
        for field, fallback in fields.items():
            fields[field] = "has(object.spec.securityContext) && has(object.spec.securityContext." + field + ") ? object.spec.securityContext." + field + " : " + fallback
        expression = "Object{spec:Object.spec{securityContext:Object.spec.securityContext{" + ",".join(key + ":" + value for key, value in fields.items()) + "}}}"
        return {"patchType": "ApplyConfiguration", "applyConfiguration": {"expression": "(" + skip + ") ? Object{} : " + expression}}
    fields = []
    for field in ["containers", "initContainers", "ephemeralContainers"]:
        items = "object.spec." + field
        path = "'/spec/" + field + "/'+string(" + items + ".indexOf(c))"
        operations = [items + ".filter(c,!has(c.securityContext)).map(c,JSONPatch{op:'add',path:" + path + "+'/securityContext',value:Object.spec." + field + ".securityContext{}})"]
        if policy == "DropAllCapabilities":
            operations += [items + ".filter(c,!has(c.securityContext)||!has(c.securityContext.capabilities)).map(c,JSONPatch{op:'add',path:" + path + "+'/securityContext/capabilities',value:Object.spec." + field + ".securityContext.capabilities{}})",
                           items + ".filter(c,!has(c.securityContext)||!has(c.securityContext.capabilities)||!has(c.securityContext.capabilities.drop)||c.securityContext.capabilities.drop!=['ALL']).map(c,JSONPatch{op:'add',path:" + path + "+'/securityContext/capabilities/drop',value:['ALL']})"]
        else:
            operations += [items + ".filter(c,(!has(c.securityContext)||!has(c.securityContext.allowPrivilegeEscalation))&&(!has(c.securityContext)||!has(c.securityContext.privileged)||!c.securityContext.privileged)&&(!has(c.securityContext)||!has(c.securityContext.capabilities)||!has(c.securityContext.capabilities.add)||!c.securityContext.capabilities.add.exists(v,v=='CAP_SYS_ADMIN'))).map(c,JSONPatch{op:'add',path:" + path + "+'/securityContext/allowPrivilegeEscalation',value:false})"]
        fields.append("(has(" + items + ") ? " + "+".join(operations) + " : [])")
    return {"patchType": "JSONPatch", "jsonPatch": {"expression": "(" + skip + ") ? [] : (" + "+".join(fields) + ")"}}


def diagnostic():
    policies = "[(" + guard("DisallowPrivileged") + ") || !variables.privilegeDefault ? '' : 'disallow-privileged',(" + guard("RequireNonRootUser") + ") || variables.identityLabels ? '' : 'require-non-root-user',(" + guard("DropAllCapabilities") + ") ? '' : 'drop-all-capabilities'].filter(p,p!='')"
    values = "variables.priorDiagnostic + (" + policies + ").filter(p,!(p in variables.priorDiagnostic))"
    value = "'['+(" + values + ").map(p,'\"'+p+'\"').join(',')+']'"
    key = "uds-core.pepr.dev/mutated"
    # Native CEL preserves arrays of the three known strings, including order,
    # duplicates and JSON whitespace. Arbitrary JSON values/escapes go to Go.
    skip = "variables.diagnosticNeedsGo || variables.identityLabels"
    ensure = "!has(object.metadata.annotations) ? [JSONPatch{op:'add',path:'/metadata/annotations',value:{}}] : []"
    patch = "[JSONPatch{op:'add',path:" + json.dumps(annotation_path(key)) + ",value:" + value + "}]"
    return {"patchType": "JSONPatch", "jsonPatch": {"expression": "(" + skip + ") || (" + values + ").size()==0 ? [] : (" + ensure + ")+" + patch}}


def diagnostic_variables():
    key = json.dumps("uds-core.pepr.dev/mutated")
    whitespace = "[ \\t\\r\\n]*"
    token = '\"(disallow-privileged|require-non-root-user|drop-all-capabilities)\"'
    pattern = "^" + whitespace + "\\[" + whitespace + "(" + token + "(" + whitespace + "," + whitespace + token + ")*)?" + whitespace + "\\]" + whitespace + "$"
    return [
        {"name": "diagnosticText", "expression": "has(object.metadata.annotations) && " + key + " in object.metadata.annotations ? object.metadata.annotations[" + key + "] : ''"},
        {"name": "diagnosticNeedsGo", "expression": "variables.diagnosticText != '' && !variables.diagnosticText.matches(" + json.dumps(pattern) + ")"},
        {"name": "priorDiagnostic", "expression": "variables.diagnosticText == '' || variables.diagnosticNeedsGo || variables.diagnosticText.trim().matches('^\\\\[[ \\t\\r\\n]*\\\\]$') ? [] : variables.diagnosticText.trim().substring(1,variables.diagnosticText.trim().size()-1).split(',').map(p,p.trim()).map(p,p.substring(1,p.size()-1))"},
    ]


def rules(group, resources, operations=None):
    return {"resourceRules": [{"apiGroups": [group], "apiVersions": ["v1" if group in ["", "monitoring.coreos.com"] else "v1alpha1"], "operations": operations or ["CREATE", "UPDATE"], "resources": resources}]}


def pair(kind, name, spec, params=False):
    policy = {"apiVersion": "admissionregistration.k8s.io/v1", "kind": kind, "metadata": {"name": name}, "spec": spec}
    binding_spec = {"policyName": name, "matchResources": copy.deepcopy(SELECTOR)}
    if kind == "ValidatingAdmissionPolicy": binding_spec["validationActions"] = ["Deny"]
    if params:
        spec["paramKind"] = PARAM_KIND
        binding_spec["paramRef"] = {"name": "uds-native-grants", "namespace": "uds-policy-exemptions", "parameterNotFoundAction": "Deny"}
        if spec["matchConstraints"]["resourceRules"][0]["apiGroups"] == [""]:
            binding_spec["matchResources"]["namespaceSelector"]["matchExpressions"][0]["values"].append("uds-system")
    return [policy, {"apiVersion": "admissionregistration.k8s.io/v1", "kind": kind + "Binding", "metadata": {"name": name}, "spec": binding_spec}]


def render():
    bootstrap.render()
    routing.render()
    baseline = json.loads(ROOT.joinpath("baseline.json").read_text())
    output = []
    for original in baseline["items"]:
        if original["kind"] != "ValidatingAdmissionPolicy": continue
        obj = copy.deepcopy(original)
        name = obj["metadata"]["name"].replace("ark-native", "uds-native")
        spec = obj["spec"]
        if "probe" in name:
            output += pair(obj["kind"], name, spec)
            continue
        policies = POD_POLICIES if "pod" in name else SERVICE_POLICIES
        spec["variables"] = spec.get("variables", []) + grant_variables(policies)
        spec["validations"] = spec["validations"][:len(policies)]
        if policies == POD_POLICIES:
            spec["variables"].append({"name": "codeIdentity", "expression": "variables.containers.exists(c,c.name in ['istio-proxy','istio-init'])"})
            spec["validations"][13]["expression"] = "(!has(object.metadata.annotations)||object.metadata.annotations.all(k,!(k in ['traffic.sidecar.istio.io/excludeInboundPorts','traffic.sidecar.istio.io/excludeInterfaces','traffic.sidecar.istio.io/excludeOutboundIPRanges','traffic.sidecar.istio.io/excludeOutboundPorts','traffic.sidecar.istio.io/includeInboundPorts','traffic.sidecar.istio.io/includeOutboundIPRanges','traffic.sidecar.istio.io/includeOutboundPorts','sidecar.istio.io/interceptionMode','traffic.sidecar.istio.io/kubevirtInterfaces','istio.io/redirect-virtual-interfaces']))) && (request.namespace=='istio-system'||!has(object.metadata.annotations)||!('sidecar.istio.io/inject' in object.metadata.annotations)||object.metadata.annotations['sidecar.istio.io/inject'].trim()=='true') && (request.namespace=='istio-system'||!has(object.metadata.labels)||!('sidecar.istio.io/inject' in object.metadata.labels)||object.metadata.labels['sidecar.istio.io/inject'].trim()=='true')"
            spec["validations"][15]["expression"] = "variables.contexts.all(x,(!has(x.runAsUser)||x.runAsUser!=1337)&&(!has(x.runAsGroup)||x.runAsGroup!=1337)&&(!has(x.fsGroup)||x.fsGroup!=1337)&&(!has(x.supplementalGroups)||!x.supplementalGroups.exists(g,g==1337)))"
            spec["validations"][15]["message"] = "Application containers must not use UID/GID 1337 (Istio proxy) unless they are trusted Istio components"
        for policy, validation in zip(policies, spec["validations"]):
            delegated = " || variables.codeIdentity" if policy in ["RequireNonRootUser", "RestrictCapabilities", "RestrictIstioUser", "RestrictIstioTrafficOverrides"] else ""
            validation["expression"] = guard(policy, True) + delegated + " || (" + validation["expression"] + ")"
        legacy_present = " || ".join("variables.legacy" + policy for policy in policies)
        spec["validations"].append({"expression": "!(" + legacy_present + ") || variables.fallbackReady", "message": "Legacy exemption evaluation requires the current complete Go admission callback"})
        spec["validations"].append({"expression": "variables.mutationReady == true", "message": "Admission exemption snapshot changed between mutation and validation; retry the request"})
        spec["validations"].append({"expression": "params.spec.valid == true", "message": "Admission exemption inputs are invalid; repair the protected snapshot"})
        output += pair(obj["kind"], name, spec, True)
    variables = grant_variables(POD_POLICIES) + diagnostic_variables() + [
        {"name": "containers", "expression": CONTAINERS},
        {"name": "identityLabels", "expression": "has(object.metadata.labels) && ['uds/user','uds/group','uds/fsgroup'].exists(k,k in object.metadata.labels && object.metadata.labels[k]!='')"},
        {"name": "privilegeDefault", "expression": "variables.containers.exists(c,(!has(c.securityContext)||!has(c.securityContext.allowPrivilegeEscalation))&&(!has(c.securityContext)||!has(c.securityContext.privileged)||!c.securityContext.privileged)&&(!has(c.securityContext)||!has(c.securityContext.capabilities)||!has(c.securityContext.capabilities.add)||!c.securityContext.capabilities.add.exists(v,v=='CAP_SYS_ADMIN')))"}]
    # Diagnose before defaults change the evidence of which default was applied.
    mutations = [mutation_revision(), fallback_marker(POD_POLICIES, True), diagnostic(), defaults("DisallowPrivileged"), defaults("RequireNonRootUser"), defaults("DropAllCapabilities"), markers(POD_POLICIES)]
    output += pair("MutatingAdmissionPolicy", "uds-native-defaults-profile", {"failurePolicy": "Fail", "reinvocationPolicy": "IfNeeded", "matchConstraints": rules("", ["pods", "pods/ephemeralcontainers"]), "variables": variables, "mutations": mutations}, True)
    output += pair("MutatingAdmissionPolicy", "uds-native-service-markers", {"failurePolicy": "Fail", "reinvocationPolicy": "IfNeeded", "matchConstraints": rules("", ["services"]), "variables": grant_variables(SERVICE_POLICIES), "mutations": [mutation_revision(), fallback_marker(SERVICE_POLICIES), markers(SERVICE_POLICIES)]}, True)
    output += pair("MutatingAdmissionPolicy", "uds-native-monitor-defaults", {"failurePolicy": "Fail", "reinvocationPolicy": "IfNeeded", "matchConstraints": rules("monitoring.coreos.com", ["servicemonitors", "podmonitors"]), "mutations": [{"patchType": "ApplyConfiguration", "applyConfiguration": {"expression": "has(object.spec.fallbackScrapeProtocol) && object.spec.fallbackScrapeProtocol!='' ? Object{} : Object{spec:Object.spec{fallbackScrapeProtocol:'PrometheusText0.0.4'}}"}}]})
    output += pair("ValidatingAdmissionPolicy", "uds-native-package-namespace", {"failurePolicy": "Fail", "matchConstraints": rules("uds.dev", ["packages"]), "validations": [{"expression": "!(request.namespace in ['kube-system','kube-public','_unknown_','pepr-system'])", "message": "invalid namespace"}]})
    output += pair("ValidatingAdmissionPolicy", "uds-native-exemption-shape", {"failurePolicy": "Fail", "matchConstraints": rules("uds.dev", ["exemptions"]), "validations": [{"expression": "params.spec.allowAllNamespaces || request.namespace=='uds-policy-exemptions'", "message": "Exemptions must be created in the protected uds-policy-exemptions namespace"}, {"expression": "!has(object.spec.exemptions)||object.spec.exemptions.all(e,e.policies.all(p,(e.matcher.kind=='service')==(p in ['RestrictExternalNames','DisallowNodePortServices'])))", "message": "Exemption matcher kind is incompatible with its policy"}]}, True)
    # Parameter resolution happens before matchConditions. A missing/invalid
    # grant union must not prevent recreating the serving controller itself.
    # Ordinary uds-system resources retain the complete fail-closed Go path.
    # The narrow authenticated recovery path receives all ordinary checks here,
    # without parameters, delegated policies, tenant skip markers or exemptions.
    for category, predicate in [("pod", bootstrap.POD), ("service", bootstrap.SERVICE)]:
        original = next(policy for policy in baseline["items"] if policy["kind"] == "ValidatingAdmissionPolicy" and category + "-profile" in policy["metadata"]["name"])
        spec = copy.deepcopy(original["spec"])
        spec["validations"] = spec["validations"][:16 if category == "pod" else 2]
        if category == "pod":
            spec["validations"][15]["expression"] = "variables.contexts.all(x,(!has(x.runAsUser)||x.runAsUser!=1337)&&(!has(x.runAsGroup)||x.runAsGroup!=1337)&&(!has(x.fsGroup)||x.fsGroup!=1337)&&(!has(x.supplementalGroups)||!x.supplementalGroups.exists(g,g==1337)))"
        spec["matchConditions"] = [{"name": "authenticated-controller-recovery", "expression": predicate}]
        output += pair("ValidatingAdmissionPolicy", "uds-native-controller-" + category + "-recovery", spec)
    recovery_variables = [copy.deepcopy(value) for value in variables if value["name"] in ["containers", "identityLabels", "privilegeDefault", "diagnosticText", "diagnosticNeedsGo", "priorDiagnostic"]]
    next(value for value in recovery_variables if value["name"] == "identityLabels")["expression"] = "false"
    recovery_mutations = [copy.deepcopy(value) for value in mutations[2:6]]
    for mutation in recovery_mutations:
        body = mutation.get("jsonPatch", mutation.get("applyConfiguration"))
        for policy in ["DisallowPrivileged", "RequireNonRootUser", "DropAllCapabilities"]:
            body["expression"] = body["expression"].replace(guard(policy), "false")
        # Recovery must always apply safe defaults even with an unsupported
        # diagnostic value; no unavailable Go callback can own those defaults.
        if mutation != recovery_mutations[0]:
            body["expression"] = body["expression"].replace("variables.diagnosticNeedsGo", "false")
    output += pair("MutatingAdmissionPolicy", "uds-native-controller-pod-defaults-recovery", {"failurePolicy": "Fail", "reinvocationPolicy": "IfNeeded", "matchConstraints": rules("", ["pods"]), "matchConditions": [{"name": "authenticated-controller-recovery", "expression": bootstrap.POD}], "variables": recovery_variables, "mutations": recovery_mutations})
    rendered = {"apiVersion": "v1", "kind": "List", "items": output}
    ROOT.joinpath("policies.json").write_text(json.dumps(rendered, indent=2) + "\n")
    chart = ROOT.parent.joinpath("chart")
    chart.joinpath("files/native-admission").mkdir(parents=True, exist_ok=True)
    chart.joinpath("crds").mkdir(exist_ok=True)
    chart.joinpath("files/native-admission/policies.json").write_text(json.dumps(rendered, indent=2) + "\n")
    chart.joinpath("files/native-admission/empty-parameters.json").write_text(ROOT.joinpath("empty-parameters.json").read_text())
    chart.joinpath("crds/admissionparameters.policy.uds.dev.json").write_text(ROOT.joinpath("parameters-crd.json").read_text())


if __name__ == "__main__":
    render()
