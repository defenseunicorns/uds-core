# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

{{- define "uds.admission.servingData" -}}
{{- if not (hasKey .Values "_udsControllerServingData") -}}
{{- $secret := lookup "v1" "Secret" .Release.Namespace "uds-controller-serving-certificate" -}}
{{- if $secret -}}
{{- $ca := index $secret.data "ca.crt" | default (index $secret.data "tls.crt") -}}
{{- $annotations := $secret.metadata.annotations | default dict -}}
{{- $active := index $annotations "uds.dev/serving-active-ca" | default "" -}}
{{- $previous := index $annotations "uds.dev/serving-previous-ca" | default "" -}}
{{- $bundle := $ca | b64dec -}}
{{- if and $active (ne $active $ca) -}}
{{- $bundle = printf "%s%s" $bundle ($active | b64dec) -}}
{{- else if and $previous (lt (now | unixEpoch | int64) (index $annotations "uds.dev/serving-overlap-until" | default "0" | int64)) -}}
{{- $bundle = printf "%s%s" $bundle ($previous | b64dec) -}}
{{- end -}}
{{- $_ := set .Values "_udsControllerServingData" (dict "existing" true "tls.crt" (index $secret.data "tls.crt") "tls.key" (index $secret.data "tls.key") "ca.crt" $ca "bundle" ($bundle | b64enc)) -}}
{{- else -}}
{{- $host := printf "uds-controller.%s.svc" .Release.Namespace -}}
{{- $cert := genSelfSignedCert $host nil (list $host (printf "%s.cluster.local" $host)) 365 -}}
{{- $_ := set .Values "_udsControllerServingData" (dict "existing" false "tls.crt" ($cert.Cert | b64enc) "tls.key" ($cert.Key | b64enc) "ca.crt" ($cert.Cert | b64enc) "bundle" ($cert.Cert | b64enc)) -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "uds.admission.caBundle" -}}
{{- include "uds.admission.servingData" . -}}
{{- index .Values._udsControllerServingData "bundle" -}}
{{- end -}}
