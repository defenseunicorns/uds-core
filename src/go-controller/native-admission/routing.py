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
VALIDATE = "request.namespace == 'uds-system' || (" + PRESENT + ") || (" + CODE_IDENTITY + ")"
MUTATE = "request.namespace == 'uds-system' || (" + PRESENT + ") || (request.resource.resource == 'pods' && (" + IDENTITY + "))"


def render():
    root = Path(__file__).resolve().parent
    root.joinpath("routing.json").write_text(json.dumps({"annotation": ANNOTATION, "mutationRevision": MUTATION_REVISION, "validate": VALIDATE, "mutate": MUTATE}, indent=2) + "\n")
    chart = root.parent / "chart/templates"
    chart.joinpath("_native-callbacks.tpl").write_text(
        "# Copyright 2026 Defense Unicorns\n# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial\n"
        + "{{/* Routing only requests complete Go enforcement; it never authorizes an exemption. */}}\n"
        + '{{- define "uds.admission.nativeValidateCallback" -}}\n' + VALIDATE + "\n{{- end -}}\n"
        + '{{- define "uds.admission.nativeMutateCallback" -}}\n' + MUTATE + "\n{{- end -}}\n"
    )
