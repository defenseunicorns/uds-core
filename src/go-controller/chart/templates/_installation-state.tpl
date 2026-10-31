# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
{{/* Bootstrap must never unregister authority during an ordinary Core upgrade. */}}
{{- define "uds.admission.register" -}}
{{- if or .Values.admission.register (lookup "admissionregistration.k8s.io/v1" "ValidatingWebhookConfiguration" "" "uds-controller-pods") -}}true{{- else -}}false{{- end -}}
{{- end -}}
{{- define "uds.native.enabled" -}}
{{- if or .Values.nativeAdmission.enabled (lookup "admissionregistration.k8s.io/v1" "MutatingAdmissionPolicy" "" "uds-native-defaults-profile") -}}true{{- else -}}false{{- end -}}
{{- end -}}
{{- define "uds.native.narrow" -}}
{{- if or .Values.nativeAdmission.narrowCallbacks (and (not .Values.nativeAdmission.enabled) (eq (include "uds.native.enabled" .) "true")) -}}true{{- else -}}false{{- end -}}
{{- end -}}
