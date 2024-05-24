{{/*
Expand the name of the chart.
*/}}
{{- define "uds-velero-config.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "uds-velero-config.fullname" -}}
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
{{- define "uds-velero-config.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "uds-velero-config.labels" -}}
helm.sh/chart: {{ include "uds-velero-config.chart" . }}
{{ include "uds-velero-config.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "uds-velero-config.selectorLabels" -}}
app.kubernetes.io/name: {{ include "uds-velero-config.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "uds-velero-config.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "uds-velero-config.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Set values for CSI implementation
*/}}
{{- define ".Chart.initContainers" -}}
{{- if and (eq .Values.flavor "registry1") .Values.enableCSI -}}
- name: velero-plugin-for-csi
  image: registry1.dso.mil/ironbank/opensource/velero/velero-plugin-for-csi:v0.7.0
  imagePullPolicy: IfNotPresent
  volumeMounts:
  - mountPath: /target
    name: plugins
{{- else if and (eq .Values.flavor "upstream") .Values.enableCSI -}}
- name: velero-plugin-for-csi
  image: velero/velero-plugin-for-csi:v0.7.0
  imagePullPolicy: IfNotPresent
  volumeMounts:
    - mountPath: /target
      name: plugins
{{- end -}}
{{- end -}}

{{- define ".Chart.configuration" -}}
{{- if .Values.enableCSI -}}
  features: EnableCSI
{{- end -}}