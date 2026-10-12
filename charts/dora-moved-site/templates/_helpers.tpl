{{- define "dora-moved-site.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "dora-moved-site.fullname" -}}
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

{{/* Name of one tenant's resources: <fullname>-<tenant>. Call with (dict "root" $ "tenant" $key). */}}
{{- define "dora-moved-site.tenantName" -}}
{{- printf "%s-%s" (include "dora-moved-site.fullname" .root) .tenant | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "dora-moved-site.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
app.kubernetes.io/name: {{ include "dora-moved-site.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: dora
{{- end }}

{{/* Call with (dict "root" $ "tenant" $key). */}}
{{- define "dora-moved-site.selectorLabels" -}}
app.kubernetes.io/name: {{ include "dora-moved-site.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
dora-moved-site/tenant: {{ .tenant }}
{{- end }}

{{/* Ingress host of a tenant: its host override, else oldUrl without scheme, port and slash. */}}
{{- define "dora-moved-site.host" -}}
{{- if .host }}
{{- .host }}
{{- else }}
{{- regexReplaceAll ":[0-9]+$" (regexReplaceAll "^https?://" (trimSuffix "/" .oldUrl) "") "" }}
{{- end }}
{{- end }}

{{/* Tenants that are not switched off (enabled: false). */}}
{{- define "dora-moved-site.enabled" -}}
{{- ne (toString .enabled) "false" }}
{{- end }}
