"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Loader2, SlidersHorizontal } from "lucide-react";

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
 * tool's parameters behind a Params button. The prompt area has a fixed
 * height and scrolls; the toolbar's chevron makes it taller, over the chart,
 * to read or edit a long prompt. The composer is see-through until it is
 * being used (focused, expanded, or its Params open). The page keeps
 * `FloatingToolComposer.PAGE_SPACE` under the chart, so the whole chart
 * scrolls clear of the composer at its resting height.
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
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <section
                aria-label={`${title} controls`}
                className={cn(
                    "pointer-events-auto w-full max-w-xl rounded-md border shadow-lg transition-[background-color,border-color,box-shadow]",
                    "has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-[3px] has-[textarea:focus-visible]:ring-ring/50",
                    expanded
                        ? "bg-card dark:bg-secondary"
                        : cn(
                              "bg-card/70 backdrop-blur-sm dark:bg-secondary/70",
                              "focus-within:bg-card dark:focus-within:bg-secondary",
                              "has-[[data-state=open]]:bg-card dark:has-[[data-state=open]]:bg-secondary",
                          ),
                )}
            >
                {notice && <div className="px-2 pt-2">{notice}</div>}
                <div
                    className={cn(
                        "overflow-y-auto overscroll-contain transition-[height]",
                        expanded ? "h-[45vh]" : "h-[4.5rem]",
                    )}
                >
                    {prompt}
                </div>
                <div className="flex items-center gap-1.5 p-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button type="button" variant="outline" size="sm">
                                <SlidersHorizontal className="text-muted-foreground" />
                                Params
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
                        onReset={onReset}
                        onSync={onSync}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="ml-auto"
                        aria-label={expanded ? "Shrink the prompt" : "Expand the prompt"}
                        aria-expanded={expanded}
                        onClick={() => setExpanded((e) => !e)}
                    >
                        {expanded ? (
                            <ChevronDown className="text-muted-foreground" />
                        ) : (
                            <ChevronUp className="text-muted-foreground" />
                        )}
                    </Button>
                    <Button type="button" size="sm" onClick={onRun} disabled={runDisabled}>
                        {isExecuting && <Loader2 className="animate-spin" />}
                        Run
                    </Button>
                </div>
            </section>
        </div>
    );
}

/** Room the page leaves under the chart for the composer at its resting height. */
FloatingToolComposer.PAGE_SPACE = "pb-36";
