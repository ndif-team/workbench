"use client";

import { useState } from "react";
import { NotebookPen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TutorialNoteView } from "@/lib/tutorialNotes";
import { TutorialNotesList } from "./TutorialNotesList";

/**
 * "Your notes": everything the participant has written so far, reachable from
 * the panel header on every step — the sibling of TutorialGlossary and
 * deliberately structurally identical to it.
 *
 * Each step's reflection box clears when the step advances, so until now a
 * participant had no way to re-read what they'd noticed two steps ago, and the
 * text only existed in the tutorial_events table an admin can query. Opening
 * this costs one click and leaves the step in place.
 *
 * Fetches nothing: the panel owns the query so this and the completion recap
 * render the same list.
 */
export function TutorialNotes({
    notes,
    loading,
    onOpen,
    onJumpToStep,
}: {
    notes: TutorialNoteView[];
    loading?: boolean;
    onOpen?: () => void;
    /** Navigate to a note's step. Omit to render the list non-interactive. */
    onJumpToStep?: (stepId: string) => void;
}) {
    // Controlled only so a jump can close it: a popover left open over the step
    // it just navigated to hides the thing the participant asked to see.
    const [open, setOpen] = useState(false);

    return (
        <Popover
            open={open}
            // onOpenChange rather than the trigger's onClick, so a keyboard open
            // counts too and a close doesn't re-fire the event.
            onOpenChange={(next) => {
                setOpen(next);
                if (next) onOpen?.();
            }}
        >
            <PopoverTrigger asChild>
                <Button
                    // Anchor so the orientation walkthrough can call this out,
                    // the same way it does the glossary.
                    id="tutorial-notes"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
                    title="What you've noticed so far"
                    aria-label="Your notes from earlier steps"
                    // Keep the header's drag gesture from swallowing the tap.
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <NotebookPen className="h-3.5 w-3.5" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                side="bottom"
                className="w-80 max-h-[70vh] overflow-auto p-3"
            >
                <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium">What you&apos;ve noticed</h3>
                    <TutorialNotesList
                        notes={notes}
                        loading={loading}
                        onJumpToStep={
                            onJumpToStep &&
                            ((stepId) => {
                                setOpen(false);
                                onJumpToStep(stepId);
                            })
                        }
                    />
                </div>
            </PopoverContent>
        </Popover>
    );
}
