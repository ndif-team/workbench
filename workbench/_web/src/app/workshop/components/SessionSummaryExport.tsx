"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { loadSessionAnnotations } from "@/actions/workshop";

function buildMarkdown(rows: { exampleId: string; annotationText: string; framingResponse: string }[]): string {
    const lines: string[] = ["# Workshop session — your reflections", ""];
    if (rows.length === 0) {
        lines.push("_No reflections recorded in this session._");
        return lines.join("\n");
    }
    for (const r of rows) {
        lines.push(`## ${r.exampleId}`);
        if (r.annotationText) {
            lines.push("", "**Reflection:**", r.annotationText);
        }
        if (r.framingResponse) {
            lines.push("", "**Critical-framing response:**", r.framingResponse);
        }
        lines.push("");
    }
    return lines.join("\n");
}

export function SessionSummaryExport() {
    const [busy, setBusy] = useState(false);

    const onDownload = async () => {
        setBusy(true);
        try {
            const rows = await loadSessionAnnotations();
            const md = buildMarkdown(
                rows.map((r) => ({
                    exampleId: r.exampleId,
                    annotationText: r.annotationText,
                    framingResponse: r.framingResponse,
                })),
            );
            const blob = new Blob([md], { type: "text/markdown" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "workshop-summary.md";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Button
            type="button"
            variant="outline"
            data-testid="session-summary-export"
            disabled={busy}
            onClick={onDownload}
        >
            {busy ? "Preparing…" : "Download my session summary"}
        </Button>
    );
}
