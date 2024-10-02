{{/*
Expand the name of the chart.
*/}}
{{- define "uds-grafana-config.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "uds-grafana-config.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "uds-grafana-config.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "uds-grafana-config.labels" -}}
helm.sh/chart: {{ include "uds-grafana-config.chart" . }}
{{ include "uds-grafana-config.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "uds-grafana-config.selectorLabels" -}}
app.kubernetes.io/name: {{ include "uds-grafana-config.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "uds-grafana-config.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "uds-grafana-config.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
    This template validates the PostgreSQL configuration for Grafana.
    It ensures either:
    1. An internal PostgreSQL is enabled with both `remoteSelector` and `remoteNamespace` provided as well as the full configuration required for external postgres (see below).
    2. An external PostgreSQL is properly configured with all required values (`host`, `database`, `user`, `password`, and `port`).
    3. No configuration is provided for a PostgresQL database (internal database will be used).

    If internal PostgreSQL is enabled but `remoteSelector` or `remoteNamespace` are missing, an error is thrown.

    In addition:
    - If any postgresql settings are partially filled (excluding `port`, `internal`, and `ssl_mode`), an error is thrown.
    - If no postgresql settings are provided, returns `"false"`.
    - If all required postgresql settings are provided, returns `"true"`.

    Returns `"true"` if a valid configuration is detected, otherwise `"false"` if no configuration is set, or an error if the configuration is incomplete.
*/}}
{{- define "grafana.postgresql.config" -}}
{{- if .Values.postgresql.internal.enabled }}
{{- if or (empty .Values.postgresql.internal.remoteSelector) (empty .Values.postgresql.internal.remoteNamespace) -}}
{{- fail "Missing remoteSelector or remoteNamespace for internal PostgreSQL." -}}
{{- end }}
{{- end }}
{{- if (empty (compact (values (omit .Values.postgresql "port" "internal" "ssl_mode")))) -}}
{{- if .Values.postgresql.internal.enabled -}}
{{- fail "Missing configuration for internal postgres host, database, user, and password." -}}
{{- end }}
{{ default "false" "" }}
{{- else }}
{{- range $k := list "host" "database" "user" "password" "port" -}}
{{- if empty (get $.Values.postgresql $k) -}}
{{- fail (printf "Missing value for \"postgresql.%s\"." $k) -}}
{{- end }}
{{- end }}
{{- default "true" "" }}
{{- end }}
{{- end }}
