{{/* vim: set filetype=mustache: */}}
{{/*
Expand the name of the chart.
*/}}
{{- define "keycloak.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate to 20 characters because this is used to set the node identifier in WildFly which is limited to
23 characters. This allows for a replica suffix for up to 99 replicas.
*/}}
{{- define "keycloak.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 20 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 20 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 20 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "keycloak.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "keycloak.labels" -}}
helm.sh/chart: {{ include "keycloak.chart" . }}
{{ include "keycloak.selectorLabels" . }}
app.kubernetes.io/version: {{ .Values.image.tag | default .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "keycloak.selectorLabels" -}}
app.kubernetes.io/name: {{ include "keycloak.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "keycloak.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "keycloak.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Create a default fully qualified app name for the postgres requirement.
*/}}
{{- define "keycloak.postgresql.fullname" -}}
{{- $postgresContext := dict "Values" .Values.postgresql "Release" .Release "Chart" (dict "Name" "postgresql") -}}
{{ include "keycloak.fullname" .}}-{{ include "postgresql.name" $postgresContext }}
{{- end }}

{{/*
Create the service DNS name.
*/}}
{{- define "keycloak.serviceDnsName" -}}
{{ include "keycloak.fullname" . }}-headless.{{ .Release.Namespace }}.svc.{{ .Values.clusterDomain }}
{{- end }}

{{/*
Check external PostgreSQL connection information. Fails when required values are missing or if PostgreSQL is configured when devMode is enabled.
*/}}

{{- define "keycloak.postgresql.config" -}}
{{- if not .Values.devMode -}}
{{- if .Values.postgresql -}}
{{ $requiredKeys := list "username" "password" "database" "host" "port" }}
{{- range $k := $requiredKeys -}}
{{ if empty (get $.Values.postgresql $k) }}{{- fail (printf "Missing value for \"postgresql.%s\"." $k ) -}}{{- end }}
{{- end }}
{{- else -}}{{fail "You must define \"username\", \"password\", \"database\", \"host\", and \"port\" for \"postgresql\"."}}
{{- end -}}
{{- default "true" "" }}
{{- else if not (empty (compact (values (omit .Values.postgresql "port")))) -}}
{{ fail "Cannot use an external PostgreSQL Database when devMode is enabled." -}}
{{- else -}}
{{ default "false" "" }}
{{- end }}
{{- end }}