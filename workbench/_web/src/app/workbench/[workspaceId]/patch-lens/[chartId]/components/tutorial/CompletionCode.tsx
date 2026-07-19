"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Finish message shown after the final unit (§3.8). The text is authored
 * per-workshop (workshops.completion_text) — typically the Prolific completion
 * code plus a thank-you — rather than an env value, so each study/workshop can
 * carry its own code. Shown client-side; the unit-6 step_completed event is in
 * the DB, so completion is verifiable post-hoc.
 */
export function CompletionCode({ text }: { text?: string }) {
    const [copied, setCopied] = useState(false);
    const body = (text ?? "").trim();

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(body);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard blocked — the text is visible to copy manually */
        }
    };

    return (
        <div className="rounded border border-primary/40 bg-primary/5 p-3">
            <p className="text-sm font-medium">You’re done — thank you!</p>
            {body ? (
                <>
                    <div className="mt-2 flex items-start gap-2">
                        <p className="flex-1 whitespace-pre-wrap rounded border bg-background px-2 py-1.5 font-mono text-sm">
                            {body}
                        </p>
                        <button
                            type="button"
                            onClick={copy}
                            className="flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                            title="Copy"
                        >
                            {copied ? (
                                <Check className="h-3.5 w-3.5" />
                            ) : (
                                <Copy className="h-3.5 w-3.5" />
                            )}
                            {copied ? "Copied" : "Copy"}
                        </button>
                    </div>
                </>
            ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                    Thanks for completing the tutorial.
                </p>
            )}
        </div>
    );
}
