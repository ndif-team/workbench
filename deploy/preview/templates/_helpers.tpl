{{- define "preview.name" -}}
{{- printf "pr-%s" .Values.prNumber | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "preview.labels" -}}
app.kubernetes.io/name: workbench-preview
app.kubernetes.io/instance: {{ include "preview.name" . }}
app.kubernetes.io/managed-by: helm
workbench.preview/pr: "{{ .Values.prNumber }}"
workbench.preview/sha: "{{ .Values.commitSha }}"
{{- end -}}

{{- define "preview.selectorLabels" -}}
app.kubernetes.io/name: workbench-preview
app.kubernetes.io/instance: {{ include "preview.name" . }}
{{- end -}}

{{- define "preview.api.name" -}}
{{- printf "pr-%s-api" .Values.prNumber | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "preview.api.selectorLabels" -}}
app.kubernetes.io/name: workbench-preview-api
app.kubernetes.io/instance: {{ include "preview.api.name" . }}
{{- end -}}

{{- define "preview.api.labels" -}}
app.kubernetes.io/name: workbench-preview-api
app.kubernetes.io/instance: {{ include "preview.api.name" . }}
app.kubernetes.io/component: api
app.kubernetes.io/managed-by: helm
workbench.preview/pr: "{{ .Values.prNumber }}"
workbench.preview/sha: "{{ .Values.commitSha }}"
{{- end -}}
