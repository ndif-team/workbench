"use client";

import type { ReactNode } from "react";
import { Loader2, Play, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ToolPanelActions } from "./ToolPanelHeader";

interface FloatingToolComposerProps {
    /** The tool's name ("Logit Lens"). */
    title: string;
    /** The prompt editor. It grows with its text; the composer scrolls it. */
    prompt: ReactNode;
    /** The tool's parameters, shown in the Params popover. */
    params: ReactNode;
    /** A message above the prompt (a model the tool can't run). */
    notice?: ReactNode;
    isExecuting: boolean;
    runDisabled: boolean;
    onRun: () => void;
    viewMode: boolean;
    showReset: boolean;
    showSync: boolean;
    onReset: () => void;
    onSync: () => void;
}

/**
 * A tool's controls on a phone: a composer fixed to the bottom of the screen,
 * shaped like Home's (the prompt over a toolbar ending in Run), with the
 * tool's parameters behind a button. The prompt area is as tall as its text,
 * up to three lines at rest, where it scrolls; while the prompt is being
 * edited it grows with the text, over the chart, up to `45vh`. The composer
 * is see-through until it is being used (focused, or its parameters open).
 * The page keeps `FloatingToolComposer.PAGE_SPACE` under the chart, so the
 * whole chart scrolls clear of the composer at its resting height.
 */
export function FloatingToolComposer({
    title,
    prompt,
    params,
    notice,
    isExecuting,
    runDisabled,
    onRun,
    viewMode,
    showReset,
    showSync,
    onReset,
    onSync,
}: FloatingToolComposerProps) {
    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <section
                aria-label={`${title} controls`}
                className={cn(
                    "pointer-events-auto w-full max-w-xl rounded-md border shadow-lg transition-[background-color,border-color,box-shadow]",
                    "has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-[3px] has-[textarea:focus-visible]:ring-ring/50",
                    "bg-card/70 backdrop-blur-sm dark:bg-secondary/70",
                    "focus-within:bg-card dark:focus-within:bg-secondary",
                    "has-[[data-state=open]]:bg-card dark:has-[[data-state=open]]:bg-secondary",
                )}
            >
                {notice && <div className="px-2 pt-2">{notice}</div>}
                <div className="max-h-[4.5rem] overflow-y-auto overscroll-contain transition-[max-height] focus-within:max-h-[45vh]">
                    {prompt}
                </div>
                <div className="flex items-center gap-1 p-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Parameters"
                            >
                                <SlidersHorizontal className="text-muted-foreground" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent
                            side="top"
                            align="start"
                            className="flex w-64 flex-col gap-4"
                        >
                            {params}
                        </PopoverContent>
                    </Popover>
                    <ToolPanelActions
                        viewMode={viewMode}
                        showReset={showReset}
                        showSync={showSync}
                        isExecuting={isExecuting}
                        iconOnly
                        onReset={onReset}
                        onSync={onSync}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="ml-auto text-primary hover:text-primary"
                        aria-label={`Run ${title}`}
                        onClick={onRun}
                        disabled={runDisabled}
                    >
                        {isExecuting ? <Loader2 className="animate-spin" /> : <Play />}
                    </Button>
                </div>
            </section>
        </div>
    );
}

/** Room the page leaves under the chart for the composer at its resting height. */
FloatingToolComposer.PAGE_SPACE = "pb-36";
