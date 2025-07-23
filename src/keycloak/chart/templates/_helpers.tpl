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
{{- $validUsernameSecretRef := eq (include "keycloak.postgresql.username.validExistingSecretRef" .) "true" -}}
{{- $validPasswordSecretRef := eq (include "keycloak.postgresql.password.validExistingSecretRef" .) "true" -}}
{{- $validHostSecretRef := eq (include "keycloak.postgresql.host.validExistingSecretRef" .) "true" -}}
{{- $secretRefUsed := or $validUsernameSecretRef $validPasswordSecretRef $validHostSecretRef -}}

{{- $emptyUsernameValue := empty $.Values.postgresql.username -}}
{{- $emptyPasswordValue := empty $.Values.postgresql.password -}}
{{- $emptyHostValue := empty $.Values.postgresql.host -}}
{{- $emptyDatabaseValue := empty $.Values.postgresql.database -}}
{{- $emptyPortValue := empty $.Values.postgresql.port -}}

{{- $usernameConfigured := or (not $emptyUsernameValue) $validUsernameSecretRef -}}
{{- $passwordConfigured := or (not $emptyPasswordValue) $validPasswordSecretRef -}}
{{- $hostConfigured := or (not $emptyHostValue) $validHostSecretRef -}}
{{- $databaseConfigured := not $emptyDatabaseValue -}}
{{- $portConfigured := not $emptyPortValue -}}

{{- if and .Values.devMode (or $usernameConfigured $passwordConfigured $hostConfigured $databaseConfigured) -}}
    {{- fail "Cannot use an external PostgreSQL Database when 'devMode' is enabled." -}}
{{- end -}}


{{- if or $usernameConfigured $passwordConfigured $hostConfigured $databaseConfigured -}}
  {{- /* Validate username configuration */ -}}
  {{- if not $usernameConfigured -}}
    {{- fail "You must define either 'postgresql.username' or 'postgresql.secretRef.username'." -}}
  {{- end -}}

  {{- /* Validate password configuration */ -}}
  {{- if not $passwordConfigured -}}
    {{- fail "You must define either 'postgresql.password' or 'postgresql.secretRef.password'." -}}
  {{- end -}}

  {{- /* Validate host configuration */ -}}
  {{- if not $hostConfigured -}}
    {{- fail "You must define either 'postgresql.host' or 'postgresql.secretRef.host'." -}}
  {{- end -}}

  {{- /* Validate database configuration */ -}}
  {{- if not $databaseConfigured -}}
    {{- fail "Missing value for 'postgresql.database'." -}}
  {{- end -}}

  {{- /* Validate port configuration */ -}}
  {{- if not $portConfigured -}}
    {{- fail "Missing value for 'postgresql.port'." -}}
  {{- end -}}

  {{- true -}}
{{- else -}}
  {{- false -}}
{{- end -}}
{{- end -}}


{{/* Helper to determine there is a valid configured secretRef for PostgreSQL username */}}
{{- define "keycloak.postgresql.username.validExistingSecretRef" -}}
  {{- if not (empty (compact (values .Values.postgresql.secretRef.username))) -}}
    {{/* Validate that both name and key are set for the secretRef and are not set to "", otherwise fail*/}}
    {{- if or (empty .Values.postgresql.secretRef.username.name) (empty .Values.postgresql.secretRef.username.key) -}}
      {{- fail "Both \"postgresql.secretRef.username.name\" and \"postgresql.secretRef.username.key\" must be set when using secretRef." -}}
    {{- else -}}
      {{- true -}}
    {{- end -}}
  {{- else -}}
    {{- false -}}
  {{- end -}}
{{- end -}}

{{/* Get the secret name for PostgreSQL username. */}}
{{- define "keycloak.postgresql.username.secretName" -}}
{{- if eq (include "keycloak.postgresql.username.validExistingSecretRef" .) "true" -}}
{{- .Values.postgresql.secretRef.username.name -}}
{{- else -}}
{{- include "keycloak.fullname" . }}-postgresql
{{- end -}}
{{- end -}}

{{/* Get the secret key for PostgreSQL username. */}}
{{- define "keycloak.postgresql.username.secretKey" -}}
{{- if eq (include "keycloak.postgresql.username.validExistingSecretRef" .) "true" -}}
{{- .Values.postgresql.secretRef.username.key -}}
{{- else -}}
{{- "username" -}}
{{- end -}}
{{- end -}}

{{/* Helper to determine there is a valid configured secretRef for PostgreSQL password */}}
{{- define "keycloak.postgresql.password.validExistingSecretRef" -}}
  {{- if not (empty (compact (values .Values.postgresql.secretRef.password))) -}}
    {{/* Validate that both name and key are set for the secretRef and are not set to "", otherwise fail*/}}
    {{- if or (empty .Values.postgresql.secretRef.password.name) (empty .Values.postgresql.secretRef.password.key) -}}
      {{- fail "Both \"postgresql.secretRef.password.name\" and \"postgresql.secretRef.password.key\" must be set when using secretRef." -}}
    {{- else -}}
      {{- true -}}
    {{- end -}}
  {{- else -}}
    {{- false -}}
  {{- end -}}
{{- end -}}

{{/* Get the secret name for PostgreSQL password. */}}
{{- define "keycloak.postgresql.password.secretName" -}}
{{- if eq (include "keycloak.postgresql.password.validExistingSecretRef" .) "true" -}}
{{- .Values.postgresql.secretRef.password.name -}}
{{- else -}}
{{- include "keycloak.fullname" . }}-postgresql
{{- end -}}
{{- end -}}

{{/* Get the secret key for PostgreSQL password. */}}
{{- define "keycloak.postgresql.password.secretKey" -}}
{{- if eq (include "keycloak.postgresql.password.validExistingSecretRef" .) "true" -}}
{{- .Values.postgresql.secretRef.password.key -}}
{{- else -}}
{{- "password" -}}
{{- end -}}
{{- end -}}


{{/* Helper to determine there is a valid configured secretRef for PostgreSQL host */}}
{{- define "keycloak.postgresql.host.validExistingSecretRef" -}}
  {{- if not (empty (compact (values .Values.postgresql.secretRef.host))) -}}
    {{/* Validate that both name and key are set for the secretRef and are not set to "", otherwise fail*/}}
    {{- if or (empty .Values.postgresql.secretRef.host.name) (empty .Values.postgresql.secretRef.host.key) -}}
      {{- fail "Both \"postgresql.secretRef.host.name\" and \"postgresql.secretRef.host.key\" must be set when using secretRef." -}}
    {{- else -}}
      {{- true -}}
    {{- end -}}
  {{- else -}}
    {{- false -}}
  {{- end -}}
{{- end -}}

{{/* Get the secret name for PostgreSQL host. */}}
{{- define "keycloak.postgresql.host.secretName" -}}
{{- if eq (include "keycloak.postgresql.host.validExistingSecretRef" .) "true" -}}
{{- .Values.postgresql.secretRef.host.name -}}
{{- else -}}
{{- include "keycloak.fullname" . }}-postgresql
{{- end -}}
{{- end -}}

{{/* Get the secret key for PostgreSQL host. */}}
{{- define "keycloak.postgresql.host.secretKey" -}}
{{- if eq (include "keycloak.postgresql.host.validExistingSecretRef" .) "true" -}}
{{- .Values.postgresql.secretRef.host.key -}}
{{- else -}}
{{- "host" -}}
{{- end -}}
{{- end -}}

