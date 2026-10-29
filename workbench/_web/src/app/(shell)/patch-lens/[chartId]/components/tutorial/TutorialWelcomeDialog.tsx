"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TutorialWelcome } from "@/types/tutorial-content";
import { TutorialMarkdown } from "./TutorialMarkdown";

/**
 * The modal orientation that runs before step 1: a few slides carrying the
 * framing and the vocabulary, then a hand-off to the walkthrough that points at
 * the real controls.
 *
 * Replaces a paragraph that sat pinned above the prompt boxes — the one column a
 * participant has to work in — where nobody read it. The two most consistent
 * pieces of pilot feedback were "I needed to learn a lot of things before I could
 * get going" and a request for a video: this and the tour that follows it are the
 * cheap version of that.
 *
 * Content is authored in the tutorial's DB row (`content.welcome`), so slides are
 * editable in the admin UI without a deploy.
 */

interface TutorialWelcomeDialogProps {
    welcome: TutorialWelcome;
    open: boolean;
    /** Dismissed without asking for the tour (✕, Esc, or "Skip"). */
    onSkip: () => void;
    /** Finished the slides and wants the walkthrough. */
    onStartTour: () => void;
    /** Slide index, for analytics. Fires on every slide shown, including the first. */
    onSlideShown?: (index: number, slideTitle: string) => void;
}

export function TutorialWelcomeDialog({
    welcome,
    open,
    onSkip,
    onStartTour,
    onSlideShown,
}: TutorialWelcomeDialogProps) {
    const [idx, setIdx] = useState(0);
    const slides = welcome.slides;
    // Content can change under a reopen (admin edit), so clamp rather than trust
    // the retained index.
    const current = slides[Math.min(idx, slides.length - 1)];
    const isLast = idx >= slides.length - 1;

    // Reopening starts from the top: someone who asks for the orientation again
    // wants the orientation, not wherever they left off.
    useEffect(() => {
        if (open) setIdx(0);
    }, [open]);

    useEffect(() => {
        if (open && current) onSlideShown?.(idx, current.title);
        // Report the slide on show, not on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, idx]);

    if (!current) return null;

    return (
        <Dialog
            open={open}
            // Esc / overlay click / ✕ all mean "let me get on with it".
            onOpenChange={(next) => {
                if (!next) onSkip();
            }}
        >
            <DialogContent className="sm:max-w-xl" showCloseButton>
                <DialogHeader>
                    <DialogTitle className="text-base font-medium">{current.title}</DialogTitle>
                </DialogHeader>

                {/* Fixed min-height so the footer controls don't jump between a
                    one-line slide and the vocabulary grid. */}
                <div className="flex min-h-52 flex-col gap-4 overflow-auto">
                    {current.body && <TutorialMarkdown>{current.body}</TutorialMarkdown>}
                    {current.cards && (
                        <dl className="grid gap-2 sm:grid-cols-2">
                            {current.cards.map((c) => (
                                <div key={c.term} className="rounded border bg-muted/40 p-2.5">
                                    <dt className="text-sm font-medium">{c.term}</dt>
                                    <dd className="mt-0.5 text-xs leading-snug text-muted-foreground">
                                        {c.definition}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </div>

                <div className="flex items-center justify-between gap-2 border-t pt-3">
                    <div className="flex items-center gap-2">
                        {/* Progress, and a way back to a slide already passed. */}
                        <div className="flex items-center gap-1" role="tablist" aria-label="Slides">
                            {slides.map((s, i) => (
                                <button
                                    key={s.title}
                                    type="button"
                                    role="tab"
                                    aria-selected={i === idx}
                                    aria-label={`Slide ${i + 1}: ${s.title}`}
                                    onClick={() => setIdx(i)}
                                    className={`h-1.5 w-4 rounded-full transition-colors ${
                                        i === idx ? "bg-primary" : "bg-muted-foreground/25"
                                    }`}
                                />
                            ))}
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">
                            {idx + 1} of {slides.length}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onSkip}>
                            Skip
                        </Button>
                        {idx > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setIdx((i) => i - 1)}
                            >
                                Back
                            </Button>
                        )}
                        <Button
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => (isLast ? onStartTour() : setIdx((i) => i + 1))}
                        >
                            {isLast ? (welcome.tourCta ?? "Show me around") : "Next"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
