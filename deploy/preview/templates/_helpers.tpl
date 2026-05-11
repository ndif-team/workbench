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
