"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { PanelRightOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useProlificTutorial } from "@/stores/useProlificTutorial";

/**
 * Where the guided tutorial renders on desktop: a column of the tool's own
 * layout, instead of a floating panel on top of it.
 *
 * Floating had no good resting place. Over the left column it covered the prompt
 * boxes the first step tells you to use — the step's copy had to end with "drag
 * this box aside if it covers the prompt" — and moved to the right edge it covered
 * the target heatmap and the cell every check asks about. A 340px overlay on a
 * two-column tool at 1366×768 hides something load-bearing wherever it sits.
 *
 * The tutorial panel itself is rendered by PatchLensArea, which owns the run
 * state, the tokenizer and the spotlight it needs; this context lets it portal
 * into a column the page owns rather than into `document.body`. Where there is no
 * dock (mobile), `useTutorialDock()` returns null and the panel floats as before.
 */

interface TutorialDockValue {
    /**
     * Whether this layout docks the tutorial at all. Deliberately separate from
     * `el`: the column is unmounted while the tutorial is collapsed, and reading
     * "docked" off the element would flip the panel back to floating exactly then
     * — putting a floating title bar on screen next to the collapsed strip.
     */
    available: boolean;
    /** The column, once mounted. */
    el: HTMLElement | null;
    setEl: (el: HTMLElement | null) => void;
}

const TutorialDockContext = createContext<TutorialDockValue>({
    available: false,
    el: null,
    setEl: () => {},
});

export function TutorialDockProvider({ children }: { children: ReactNode }) {
    const [el, setEl] = useState<HTMLElement | null>(null);
    const value = useMemo(() => ({ available: true, el, setEl }), [el]);
    return <TutorialDockContext.Provider value={value}>{children}</TutorialDockContext.Provider>;
}

/** Whether the tutorial docks here, and the column to render into once it exists. */
export function useTutorialDock(): { available: boolean; el: HTMLElement | null } {
    const { available, el } = useContext(TutorialDockContext);
    return { available, el };
}

/** The dock's column. Render inside a ResizablePanel; the tutorial fills it. */
export function TutorialDockPanel() {
    const { setEl } = useContext(TutorialDockContext);
    return <div ref={setEl} className="flex h-full min-w-0 flex-col" />;
}

/**
 * The dock, collapsed: a strip holding the way back. Mirrors the chart sidebar's
 * collapsed state on the other side of the layout, so the two read as the same
 * mechanism.
 */
export function TutorialCollapsedRail() {
    const unitIdx = useProlificTutorial((s) => s.unitIdx);
    const total = useProlificTutorial((s) => s.units.length);
    const setCollapsed = useProlificTutorial((s) => s.setCollapsed);

    return (
        <div className="flex h-full w-10 flex-col items-center pl-1 pt-3">
            <Button
                variant="ghost"
                size="icon"
                onClick={() => setCollapsed(false)}
                className="h-7 w-7 hover:bg-muted"
                title="Expand tutorial"
            >
                <PanelRightOpen className="h-4 w-4" />
            </Button>
            <Separator className="my-2 w-6" />
            <span className="text-xs text-muted-foreground [writing-mode:vertical-lr] rotate-180">
                {total > 0 ? `Step ${unitIdx + 1} of ${total}` : "Tutorial"}
            </span>
        </div>
    );
}
