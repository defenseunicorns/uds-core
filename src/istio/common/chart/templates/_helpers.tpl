{{/*
Copyright 2026 Defense Unicorns
SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
*/}}

{{/*
Build the effective classification banner list from entries with enabled hosts,
prepending the deprecated classificationBanner value when it also has enabled hosts.
*/}}
{{- define "uds-global-istio-config.classificationBanners" -}}
{{- $classificationBanners := list -}}
{{- range (.Values.classificationBanners | default (list)) -}}
{{- if .enabledHosts -}}
{{- $classificationBanners = append $classificationBanners . -}}
{{- end -}}
{{- end -}}
{{- if .Values.classificationBanner.enabledHosts -}}
{{- $classificationBanners = prepend $classificationBanners .Values.classificationBanner -}}
{{- end -}}
{{- toYaml $classificationBanners -}}
{{- end -}}
