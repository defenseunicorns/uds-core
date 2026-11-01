# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

"""Static remote routing: object fields can add enforcement, never grant it."""
import json
from pathlib import Path

ANNOTATION = "policy.uds.dev/native-fallback"
MUTATION_REVISION = "policy.uds.dev/native-mutation-revision"
CONTAINERS = "object.spec.containers + (has(object.spec.initContainers) ? object.spec.initContainers : []) + (has(object.spec.ephemeralContainers) ? object.spec.ephemeralContainers : [])"
PRESENT = "has(object.metadata.annotations) && " + json.dumps(ANNOTATION) + " in object.metadata.annotations && object.metadata.annotations[" + json.dumps(ANNOTATION) + "] != ''"
IDENTITY = "has(object.metadata.labels) && ['uds/user','uds/group','uds/fsgroup'].exists(k,k in object.metadata.labels && object.metadata.labels[k]!='')"
CODE_IDENTITY = "request.resource.resource == 'pods' && (" + CONTAINERS + ").exists(c,c.name in ['istio-proxy','istio-init'])"
def metadata(value, field, empty):
    return f"(has({value}.metadata.{field}) ? {value}.metadata.{field} : {empty})"


OLD_LABELS = metadata('oldObject', 'labels', '{}')
NEW_LABELS = metadata('object', 'labels', '{}')
RETIREMENT = "has(request.operation) && request.operation=='UPDATE' && request.resource.group=='' && request.resource.resource in ['pods','services'] && (!has(request.subResource)||request.subResource=='') && request.userInfo.username=='system:serviceaccount:uds-system:uds-controller' && oldObject!=null && object.metadata.uid==oldObject.metadata.uid && object.spec==oldObject.spec"
for field, empty in [('annotations', '{}'), ('ownerReferences', '[]'), ('finalizers', '[]')]:
    RETIREMENT += f" && {metadata('object', field, empty)}=={metadata('oldObject', field, empty)}"
RETIREMENT += f" && 'istio.io/use-waypoint' in {OLD_LABELS} && {OLD_LABELS}['istio.io/use-waypoint']!='' && !('istio.io/use-waypoint' in {NEW_LABELS})"
RETIREMENT += f" && {NEW_LABELS}.all(k,k in {OLD_LABELS} && {NEW_LABELS}[k]=={OLD_LABELS}[k])"
RETIREMENT += f" && {OLD_LABELS}.all(k,k in ['istio.io/use-waypoint','istio.io/ingress-use-waypoint'] || (k in {NEW_LABELS} && {NEW_LABELS}[k]=={OLD_LABELS}[k]))"
VALIDATE = "request.namespace == 'uds-system' || (" + PRESENT + ") || (" + CODE_IDENTITY + ") || (" + RETIREMENT + ")"
MUTATE = "request.namespace == 'uds-system' || (" + PRESENT + ") || (request.resource.resource == 'pods' && (" + IDENTITY + ")) || (" + RETIREMENT + ")"


def render():
    root = Path(__file__).resolve().parent
    root.joinpath("routing.json").write_text(json.dumps({"annotation": ANNOTATION, "mutationRevision": MUTATION_REVISION, "workloadRetirement": RETIREMENT, "validate": VALIDATE, "mutate": MUTATE}, indent=2) + "\n")
    chart = root.parent / "chart/templates"
    chart.joinpath("_native-callbacks.tpl").write_text(
        "# Copyright 2026 Defense Unicorns\n# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial\n"
        + "{{/* Routing only requests complete Go enforcement; it never authorizes an exemption. */}}\n"
        + '{{- define "uds.admission.nativeValidateCallback" -}}\n' + VALIDATE + "\n{{- end -}}\n"
        + '{{- define "uds.admission.nativeMutateCallback" -}}\n' + MUTATE + "\n{{- end -}}\n"
    )
