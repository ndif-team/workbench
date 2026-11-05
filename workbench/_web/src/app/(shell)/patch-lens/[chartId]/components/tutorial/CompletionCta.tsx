"use client";

import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { TutorialNoteView } from "@/lib/tutorialNotes";
import { TutorialNotesList } from "./TutorialNotesList";

/**
 * Finish screen shown after the final unit. The **survey** (not the tool) issues
 * the Prolific completion code, so this links the participant onward to the
 * per-workshop survey (workshops.surveyUrl) instead of showing a code. Completion
 * stays verifiable post-hoc via the final unit's step_completed telemetry row.
 *
 * `thanks` is optional per-workshop copy (the legacy completion_text column,
 * repurposed as a thank-you note). When no survey URL is configured we fall back
 * to a plain thank-you so the participant still gets a clear end state.
 *
 * `notes` is the recap of what the participant wrote along the way — the
 * "afterwards" half of letting them see their own reflections. It renders below
 * the survey link so the survey stays the primary action here (it is what issues
 * the completion code).
 */
export function CompletionCta({
    surveyUrl,
    thanks,
    notes = [],
    onJumpToStep,
}: {
    surveyUrl?: string;
    thanks?: string;
    notes?: TutorialNoteView[];
    /**
     * Navigate to a note's step. This screen is appended to the final unit
     * rather than replacing the tutorial, so a jump simply re-renders that unit
     * and takes the recap with it — going back is a normal move here, not an
     * escape from a finished state.
     */
    onJumpToStep?: (stepId: string) => void;
}) {
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
            {/* Nothing at all when they wrote nothing: the notes were optional,
                and an empty state here would be a reproach at the moment the
                participant is being thanked. */}
            {notes.length > 0 && (
                <div className="mt-3 border-t border-primary/30 pt-3">
                    <p className="mb-2 text-sm font-medium">What you noticed</p>
                    <TutorialNotesList notes={notes} onJumpToStep={onJumpToStep} />
                </div>
            )}
        </div>
    );
}
