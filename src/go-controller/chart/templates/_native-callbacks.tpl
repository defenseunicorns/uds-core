# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
{{/* Routing only requests complete Go enforcement; it never authorizes an exemption. */}}
{{- define "uds.admission.nativeValidateCallback" -}}
request.namespace == 'uds-system' || (has(object.metadata.annotations) && "policy.uds.dev/native-fallback" in object.metadata.annotations && object.metadata.annotations["policy.uds.dev/native-fallback"] != '') || (request.resource.resource == 'pods' && (object.spec.containers + (has(object.spec.initContainers) ? object.spec.initContainers : []) + (has(object.spec.ephemeralContainers) ? object.spec.ephemeralContainers : [])).exists(c,c.name in ['istio-proxy','istio-init']))
{{- end -}}
{{- define "uds.admission.nativeMutateCallback" -}}
request.namespace == 'uds-system' || (has(object.metadata.annotations) && "policy.uds.dev/native-fallback" in object.metadata.annotations && object.metadata.annotations["policy.uds.dev/native-fallback"] != '') || (request.resource.resource == 'pods' && (has(object.metadata.labels) && ['uds/user','uds/group','uds/fsgroup'].exists(k,k in object.metadata.labels && object.metadata.labels[k]!='')))
{{- end -}}
