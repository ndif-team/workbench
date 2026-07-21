"use client";

import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Finish screen shown after the final unit. The **survey** (not the tool) issues
 * the Prolific completion code, so this links the participant onward to the
 * per-workshop survey (workshops.surveyUrl) instead of showing a code. Completion
 * stays verifiable post-hoc via the final unit's step_completed telemetry row.
 *
 * `thanks` is optional per-workshop copy (the legacy completion_text column,
 * repurposed as a thank-you note). When no survey URL is configured we fall back
 * to a plain thank-you so the participant still gets a clear end state.
 */
export function CompletionCta({ surveyUrl, thanks }: { surveyUrl?: string; thanks?: string }) {
    const url = (surveyUrl ?? "").trim();
    const note = (thanks ?? "").trim();

    return (
        <div className="rounded border border-primary/40 bg-primary/5 p-3">
            <p className="text-sm font-medium">You’re done — thank you!</p>
            {url ? (
                <>
                    {note && (
                        <p className="mt-1 text-xs text-muted-foreground leading-snug">{note}</p>
                    )}
                    <Button asChild size="sm" className="mt-3">
                        <a href={url} target="_blank" rel="noopener noreferrer">
                            Continue to the survey
                            <ArrowRight className="h-4 w-4" />
                        </a>
                    </Button>
                </>
            ) : note ? (
                // No survey configured: this thank-you copy is the only end-state
                // signal and may carry a Prolific completion code (legacy
                // completion_text), so present it legibly and selectable rather
                // than as a muted aside a participant could close past unsubmitted.
                <p className="mt-2 select-all whitespace-pre-wrap rounded border bg-background px-2 py-1.5 text-sm leading-snug">
                    {note}
                </p>
            ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                    Thanks for completing the tutorial — you can close this tab.
                </p>
            )}
        </div>
    );
}
