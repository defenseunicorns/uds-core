# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
{{/* Bootstrap must never unregister authority during an ordinary Core upgrade. */}}
{{- define "uds.admission.register" -}}
{{- $secret := lookup "v1" "Secret" .Release.Namespace "uds-controller-serving-certificate" -}}
{{- $role := lookup "rbac.authorization.k8s.io/v1" "ClusterRole" "" "uds-controller" -}}
{{- $activated := false -}}
{{- $previousOwner := "" -}}
{{- if $secret -}}{{- $previousOwner = dig "metadata" "annotations" "uds.dev/admission-activation-owner" "" $secret -}}{{- end -}}
{{- if and $secret $role -}}
{{- $activated = eq (dig "metadata" "annotations" "uds.dev/admission-activation-owner" "" $secret) $role.metadata.uid -}}
{{- end -}}
{{- if or $activated .Values.admission.register (and (eq $previousOwner "") (lookup "admissionregistration.k8s.io/v1" "ValidatingWebhookConfiguration" "" "uds-controller-pods")) -}}true{{- else -}}false{{- end -}}
{{- end -}}
{{- define "uds.native.enabled" -}}
{{- if or .Values.nativeAdmission.enabled (lookup "admissionregistration.k8s.io/v1" "MutatingAdmissionPolicy" "" "uds-native-defaults-profile") -}}true{{- else -}}false{{- end -}}
{{- end -}}
{{- define "uds.native.narrow" -}}
{{- if or .Values.nativeAdmission.narrowCallbacks (and (not .Values.nativeAdmission.enabled) (eq (include "uds.native.enabled" .) "true")) -}}true{{- else -}}false{{- end -}}
{{- end -}}

{{- define "uds.admission.lifecycleOwner" -}}
{{- $role := lookup "rbac.authorization.k8s.io/v1" "ClusterRole" "" "uds-controller" -}}
{{- if $role }}
ownerReferences:
  - apiVersion: rbac.authorization.k8s.io/v1
    kind: ClusterRole
    name: uds-controller
    uid: {{ $role.metadata.uid | quote }}
    controller: true
{{- end }}
{{- end -}}
