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

{{/* Main PostgreSQL configuration validation function */}}
{{- define "keycloak.postgresql.config" -}}
{{- if not .Values.devMode -}}
{{- if .Values.postgresql -}}
{{- $requiredKeys := list "username" "password" "database" "host" "port" -}}

{{- if eq (include "keycloak.postgresql.usingExistingSecrets" .) "true" -}}
  {{- /* Validate secretRef configuration only */ -}}
  {{- range $k := $requiredKeys -}}
    {{- if empty (get $.Values.postgresql.secretRef $k) -}}{{- fail (printf "Missing secretRef configuration for \"postgresql.%s\"." $k ) -}}{{- end -}}
    {{- $secretRefConfig := get $.Values.postgresql.secretRef $k -}}
    {{- if empty $secretRefConfig.name -}}{{- fail (printf "Missing 'name' in secretRef for \"postgresql.%s\"." $k ) -}}{{- end -}}
    {{- if empty $secretRefConfig.key -}}{{- fail (printf "Missing 'key' in secretRef for \"postgresql.%s\"." $k ) -}}{{- end -}}
  {{- end -}}
{{- else -}}
  {{- /* Validate direct values only */ -}}
  {{- range $k := $requiredKeys -}}
    {{- if empty (get $.Values.postgresql $k) -}}{{- fail (printf "Missing value for \"postgresql.%s\"." $k ) -}}{{- end -}}
  {{- end -}}
{{- end -}}
{{- true -}}
{{- else -}}{{fail "You must define \"username\", \"password\", \"database\", \"host\", and \"port\" for \"postgresql\"."}}
{{- end -}}
{{- else if not (empty (compact (values (omit .Values.postgresql "port" "internal")))) -}}
{{ fail "Cannot use an external PostgreSQL Database when devMode is enabled." -}}
{{- else -}}
{{- false -}}
{{- end -}}
{{- end -}}

{{/* Helper to determine if we're using existing secrets via secretRef */}}
{{- define "keycloak.postgresql.usingExistingSecrets" -}}
{{- if and .Values.postgresql.secretRef (not (empty (compact (values .Values.postgresql.secretRef)))) -}}
true
{{- else -}}
false
{{- end -}}
{{- end -}}

{{/* Get the secret name for PostgreSQL username. */}}
{{- define "keycloak.postgresql.username.secretName" -}}
{{- if eq (include "keycloak.postgresql.usingExistingSecrets" .) "true" -}}
{{- .Values.postgresql.secretRef.username.name -}}
{{- else -}}
{{- include "keycloak.fullname" . }}-postgresql
{{- end -}}
{{- end -}}

{{/* Get the secret key for PostgreSQL username. */}}
{{- define "keycloak.postgresql.username.secretKey" -}}
{{- if eq (include "keycloak.postgresql.usingExistingSecrets" .) "true" -}}
{{- .Values.postgresql.secretRef.username.key -}}
{{- else -}}
{{- "username" -}}
{{- end -}}
{{- end -}}

{{/* Get the secret name for PostgreSQL password. */}}
{{- define "keycloak.postgresql.password.secretName" -}}
{{- if eq (include "keycloak.postgresql.usingExistingSecrets" .) "true" -}}
{{- .Values.postgresql.secretRef.password.name -}}
{{- else -}}
{{- include "keycloak.fullname" . }}-postgresql
{{- end -}}
{{- end -}}

{{/* Get the secret key for PostgreSQL password. */}}
{{- define "keycloak.postgresql.password.secretKey" -}}
{{- if eq (include "keycloak.postgresql.usingExistingSecrets" .) "true" -}}
{{- .Values.postgresql.secretRef.password.key -}}
{{- else -}}
{{- "password" -}}
{{- end -}}
{{- end -}}

{{/* Get the secret name for PostgreSQL database. */}}
{{- define "keycloak.postgresql.database.secretName" -}}
{{- if eq (include "keycloak.postgresql.usingExistingSecrets" .) "true" -}}
{{- .Values.postgresql.secretRef.database.name -}}
{{- else -}}
{{- include "keycloak.fullname" . }}-postgresql
{{- end -}}
{{- end -}}

{{/* Get the secret key for PostgreSQL database. */}}
{{- define "keycloak.postgresql.database.secretKey" -}}
{{- if eq (include "keycloak.postgresql.usingExistingSecrets" .) "true" -}}
{{- .Values.postgresql.secretRef.database.key -}}
{{- else -}}
{{- "database" -}}
{{- end -}}
{{- end -}}

{{/* Get the secret name for PostgreSQL host. */}}
{{- define "keycloak.postgresql.host.secretName" -}}
{{- if eq (include "keycloak.postgresql.usingExistingSecrets" .) "true" -}}
{{- .Values.postgresql.secretRef.host.name -}}
{{- else -}}
{{- include "keycloak.fullname" . }}-postgresql
{{- end -}}
{{- end -}}

{{/* Get the secret key for PostgreSQL host. */}}
{{- define "keycloak.postgresql.host.secretKey" -}}
{{- if eq (include "keycloak.postgresql.usingExistingSecrets" .) "true" -}}
{{- .Values.postgresql.secretRef.host.key -}}
{{- else -}}
{{- "host" -}}
{{- end -}}
{{- end -}}

{{/* Get the secret name for PostgreSQL port. */}}
{{- define "keycloak.postgresql.port.secretName" -}}
{{- if eq (include "keycloak.postgresql.usingExistingSecrets" .) "true" -}}
{{- .Values.postgresql.secretRef.port.name -}}
{{- else -}}
{{- include "keycloak.fullname" . }}-postgresql
{{- end -}}
{{- end -}}

{{/* Get the secret key for PostgreSQL port. */}}
{{- define "keycloak.postgresql.port.secretKey" -}}
{{- if eq (include "keycloak.postgresql.usingExistingSecrets" .) "true" -}}
{{- .Values.postgresql.secretRef.port.key -}}
{{- else -}}
{{- "port" -}}
{{- end -}}
{{- end -}}
