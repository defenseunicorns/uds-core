# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
"""One source for the authenticated controller recovery match conditions."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ACTOR = "(has(request.userInfo) && ((has(request.userInfo.username) && request.userInfo.username in ['system:kube-controller-manager','system:serviceaccount:kube-system:replicaset-controller']) || (has(request.userInfo.groups) && request.userInfo.groups.exists(g,g=='system:masters'))))"
POD = "request.namespace=='uds-system' && request.resource.group=='' && request.resource.resource=='pods' && (!has(request.subResource)||request.subResource=='') && " + ACTOR + " && has(object.spec.serviceAccountName) && object.spec.serviceAccountName=='uds-controller' && ((has(object.metadata.name) && object.metadata.name.startsWith('uds-controller-')) || (has(object.metadata.generateName) && object.metadata.generateName.startsWith('uds-controller-'))) && has(object.metadata.ownerReferences) && object.metadata.ownerReferences.exists(r,r.apiVersion=='apps/v1' && r.kind=='ReplicaSet' && r.name.startsWith('uds-controller-') && has(r.controller) && r.controller) && object.spec.containers.size()==1 && object.spec.containers[0].name=='controller' && (!has(object.metadata.labels)||!['uds/user','uds/group','uds/fsgroup'].exists(k,k in object.metadata.labels && object.metadata.labels[k]!='')) && (!has(object.spec.initContainers)||object.spec.initContainers.size()==0) && (!has(object.spec.ephemeralContainers)||object.spec.ephemeralContainers.size()==0)"
SERVICE = "request.namespace=='uds-system' && request.resource.group=='' && request.resource.resource=='services' && (!has(request.subResource)||request.subResource=='') && " + ACTOR + " && object.metadata.name=='uds-controller' && has(object.spec.type) && object.spec.type=='ClusterIP' && object.spec.ports.size()==1 && object.spec.ports[0].port==443 && object.spec.ports[0].targetPort==9443"
SKIP_CALLBACK = "!( (" + POD + ") || (" + SERVICE + ") )"


def render():
    ROOT.joinpath("bootstrap.json").write_text(json.dumps({"actor": ACTOR, "pod": POD, "service": SERVICE, "callback": SKIP_CALLBACK}, indent=2) + "\n")
    template = ROOT.parent.joinpath("chart/templates/_admission-bootstrap.tpl")
    template.write_text('# Copyright 2026 Defense Unicorns\n# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial\n{{- define "uds.admission.bootstrapCallback" -}}\n' + SKIP_CALLBACK + '\n{{- end -}}\n')


if __name__ == "__main__":
    render()
