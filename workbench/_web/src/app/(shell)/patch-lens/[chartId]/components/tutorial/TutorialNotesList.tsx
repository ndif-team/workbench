"use client";

import { CornerUpLeft } from "lucide-react";

import type { TutorialNoteView } from "@/lib/tutorialNotes";
import { cn } from "@/lib/utils";

/**
 * The participant's own reflections, read back to them. Purely presentational
 * and shared by both surfaces that show them: the "Your notes" popover in the
 * panel header (mid-tutorial re-reading) and the completion screen recap. It
 * fetches nothing — the container owns the query, so the two surfaces can't
 * disagree about what the participant wrote.
 *
 * A failed fetch falls through to `emptyMessage` rather than an error state or a
 * toast: this is a side panel a participant opens between steps, and a toast
 * fired from it would interrupt the step they're working on to report something
 * they can fix by reopening it.
 *
 * `onJumpToStep` is optional: without it the rows are static text, which is how
 * this renders anywhere navigation makes no sense. With it, a note is the way
 * back to the step that prompted it — re-reading "the answer settled at layer
 * 20" is most useful next to the heatmap it was written about.
 */
export function TutorialNotesList({
    notes,
    loading,
    emptyMessage = "Nothing saved yet. Your notes are what you write in the “What did you notice?” box on each step.",
    onJumpToStep,
}: {
    notes: TutorialNoteView[];
    loading?: boolean;
    emptyMessage?: string;
    /** Navigate to the note's step. Omit to render the list non-interactive. */
    onJumpToStep?: (stepId: string) => void;
}) {
    // No spinner: the panel this sits in already has run/loading indicators, and
    // a second concurrent one reads as a second thing happening.
    if (loading && notes.length === 0) {
        return (
            <p className="text-xs text-muted-foreground" aria-live="polite">
                Loading your notes…
            </p>
        );
    }

    if (notes.length === 0) {
        return <p className="text-xs text-muted-foreground leading-snug">{emptyMessage}</p>;
    }

    return (
        <ol className="flex flex-col gap-2.5">
            {notes.map((note) => {
                // A null stepNumber means the note's unit is no longer in the
                // loaded content (the tutorial was edited between sessions). The
                // note still shows, under its raw step id — but there is no step
                // to go to, so it must not render a button that goes nowhere.
                const jumpable = onJumpToStep && note.stepNumber != null;
                const heading =
                    note.stepNumber == null
                        ? note.stepTitle
                        : `Step ${note.stepNumber} · ${note.stepTitle}`;
                // Their own prose, so no font-mono. pre-wrap keeps the line
                // breaks they typed; break-words keeps a pasted token from
                // widening the popover.
                //
                // Rendered as a <span className="block"> inside the button and a
                // <p> outside it: a <p> can't legally live inside a <button>,
                // and the static row is left exactly as it was.
                const bodyClass =
                    "mt-1 border-l-2 border-primary/40 pl-2 text-sm leading-snug whitespace-pre-wrap break-words";

                return (
                    <li key={note.stepId} data-testid="tutorial-note" data-step-id={note.stepId}>
                        {jumpable ? (
                            // A real button, so Enter and Space work and the row
                            // is in the tab order. The heading carries the whole
                            // note as its label target, but "Step 3 · Patterns
                            // beat facts" plus a paragraph of the participant's
                            // own prose is a poor accessible name, so the label
                            // is written out.
                            <button
                                type="button"
                                onClick={() => onJumpToStep(note.stepId)}
                                aria-label={`Go to step ${note.stepNumber}: ${note.stepTitle}`}
                                className="-mx-1.5 block w-full rounded px-1.5 py-1 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                            >
                                <span className="flex items-center gap-1 text-xs font-medium text-primary">
                                    {/* Visible at rest: the arrow and the
                                        primary colour are the affordance, and a
                                        hover-only one would be invisible on
                                        touch. */}
                                    <CornerUpLeft className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{heading}</span>
                                </span>
                                <span className={cn("block", bodyClass)}>{note.text}</span>
                            </button>
                        ) : (
                            <>
                                <p className="text-xs font-medium text-muted-foreground">
                                    {heading}
                                </p>
                                <p className={bodyClass}>{note.text}</p>
                            </>
                        )}
                    </li>
                );
            })}
        </ol>
    );
}
