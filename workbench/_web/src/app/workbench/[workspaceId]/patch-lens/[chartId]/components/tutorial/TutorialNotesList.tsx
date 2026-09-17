"use client";

import type { TutorialNoteView } from "@/lib/tutorialNotes";

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
 */
export function TutorialNotesList({
    notes,
    loading,
    emptyMessage = "Nothing saved yet. Your notes are what you write in the “What did you notice?” box on each step.",
}: {
    notes: TutorialNoteView[];
    loading?: boolean;
    emptyMessage?: string;
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
            {notes.map((note) => (
                <li key={note.stepId} data-testid="tutorial-note" data-step-id={note.stepId}>
                    <p className="text-xs font-medium text-muted-foreground">
                        {note.stepNumber == null
                            ? note.stepTitle
                            : `Step ${note.stepNumber} · ${note.stepTitle}`}
                    </p>
                    {/* Their own prose, so no font-mono. pre-wrap keeps the line
                        breaks they typed; break-words keeps a pasted token from
                        widening the popover. */}
                    <p className="mt-1 border-l-2 border-primary/40 pl-2 text-sm leading-snug whitespace-pre-wrap break-words">
                        {note.text}
                    </p>
                </li>
            ))}
        </ol>
    );
}
