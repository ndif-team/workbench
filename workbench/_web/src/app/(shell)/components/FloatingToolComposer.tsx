"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ChevronDown, Loader2, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToolPanelActions } from "./ToolPanelHeader";

interface FloatingToolComposerProps {
    /** The tool's name ("Logit Lens"). */
    title: string;
    icon: ComponentType<{ className?: string }>;
    /** The prompt as typed, shown on the collapsed bar. */
    summary: string;
    /** The prompt editor. */
    prompt: ReactNode;
    /** The tool's parameters, shown in the Params popover. */
    params: ReactNode;
    /** A message above the prompt (a model the tool can't run). */
    notice?: ReactNode;
    /** Whether the composer starts open: a chart with nothing to show yet. */
    defaultOpen: boolean;
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
 * A tool's controls on a phone: a composer floating over the bottom of the
 * chart, shaped like Home's (the prompt over a toolbar ending in Run), with
 * the tool's parameters behind a Params button. It collapses to a bar showing
 * the prompt so the chart has the screen, and does so by itself when a run
 * starts. The bar is `FloatingToolComposer.BAR_SPACE` tall with its margins;
 * the page keeps that much room under the chart.
 */
export function FloatingToolComposer({
    title,
    icon: Icon,
    summary,
    prompt,
    params,
    notice,
    defaultOpen,
    isExecuting,
    runDisabled,
    onRun,
    viewMode,
    showReset,
    showSync,
    onReset,
    onSync,
}: FloatingToolComposerProps) {
    const [open, setOpen] = useState(defaultOpen);
    const wasExecuting = useRef(isExecuting);

    useEffect(() => {
        if (isExecuting && !wasExecuting.current) setOpen(false);
        wasExecuting.current = isExecuting;
    }, [isExecuting]);

    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {open ? (
                <section
                    aria-label={`${title} controls`}
                    className="pointer-events-auto w-full max-w-xl rounded-md border bg-card shadow-lg transition-[border-color,box-shadow] has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-[3px] has-[textarea:focus-visible]:ring-ring/50 dark:bg-secondary"
                >
                    <div className="flex items-center justify-between gap-2 pl-4 pr-2 pt-2">
                        <h2 className="text-sm font-medium">{title}</h2>
                        <div className="flex items-center gap-1.5">
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
                                aria-label={`Hide ${title} controls`}
                                onClick={() => setOpen(false)}
                            >
                                <ChevronDown className="text-muted-foreground" />
                            </Button>
                        </div>
                    </div>
                    {notice && <div className="px-2 pt-1">{notice}</div>}
                    {prompt}
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
                        <Button
                            type="button"
                            size="sm"
                            className="ml-auto"
                            onClick={onRun}
                            disabled={runDisabled}
                        >
                            {isExecuting && <Loader2 className="animate-spin" />}
                            Run
                        </Button>
                    </div>
                </section>
            ) : (
                <button
                    type="button"
                    aria-label={`Show ${title} controls`}
                    aria-expanded={false}
                    onClick={() => setOpen(true)}
                    className="pointer-events-auto flex h-11 w-full max-w-xl items-center gap-2 rounded-md border bg-card px-3 shadow-lg outline-none transition-colors hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-secondary"
                >
                    {isExecuting ? (
                        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    {summary ? (
                        <span className="min-w-0 flex-1 truncate text-left text-sm">{summary}</span>
                    ) : (
                        <span className="min-w-0 flex-1 truncate text-left text-sm text-muted-foreground">
                            Enter a prompt
                        </span>
                    )}
                    <SlidersHorizontal className="size-4 shrink-0 text-muted-foreground" />
                </button>
            )}
        </div>
    );
}

/** Room the page leaves under the chart for the collapsed bar. */
FloatingToolComposer.BAR_SPACE = "pb-16";
