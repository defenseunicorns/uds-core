{{/*
Copyright 2026 Defense Unicorns
SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
*/}}

{{/*
Build the effective classification banner list, prepending the deprecated
classificationBanner value when it has enabled hosts.
*/}}
{{- define "uds-global-istio-config.classificationBanners" -}}
{{- $classificationBanners := .Values.classificationBanners | default (list) -}}
{{- if .Values.classificationBanner.enabledHosts -}}
{{- $classificationBanners = prepend $classificationBanners .Values.classificationBanner -}}
{{- end -}}
{{- toYaml $classificationBanners -}}
{{- end -}}
