"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Loader2, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ModelControl } from "@/components/ModelControl";
import { cn } from "@/lib/utils";
import { ToolPanelActions } from "./ToolPanelHeader";

interface FloatingToolComposerProps {
    /** The tool's name ("Logit Lens"). */
    title: string;
    /** The prompt editor. It grows with its text; the composer scrolls it. */
    prompt: ReactNode;
    /** The tool's parameters, shown in a popover behind the sliders button. */
    params?: ReactNode;
    /** Other toolbar controls, before Reset and Sync (a tool's own toggles). */
    tools?: ReactNode;
    /** What the next tap does, shown in the toolbar beside Run. */
    hint?: string;
    /** Classes for the prompt area, replacing its own sizing and scrolling. */
    promptClassName?: string;
    /** Draws a rule between the prompt area and the toolbar. */
    divided?: boolean;
    /** Classes for Run (a tool's own accent color). */
    runClassName?: string;
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
 * shaped like Home's (the prompt over a toolbar ending in the model picker
 * and Run), with the tool's parameters behind a button. While it is on the
 * page it is the page's model picker: the item header hides its own
 * (`FloatingToolComposer.HIDDEN_BESIDE`). The prompt area is as tall as its text,
 * up to three lines at rest, where it scrolls; while the prompt is being
 * edited it grows with the text, over the chart, up to `45vh`. The composer
 * is see-through until it is being used (focused, its parameters open, or
 * last tapped: `data-active`, which a tool's own prompt area can size itself
 * by through the `composer` group).
 * The page keeps `FloatingToolComposer.PAGE_SPACE` under the chart, so the
 * whole chart scrolls clear of the composer at its resting height.
 */
export function FloatingToolComposer({
    title,
    prompt,
    params,
    tools,
    hint,
    promptClassName,
    divided = false,
    runClassName,
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
    const sectionRef = useRef<HTMLElement>(null);
    const [active, setActive] = useState(false);

    useEffect(() => {
        const onPointerDown = (e: PointerEvent) => {
            const target = e.target as Element | null;
            if (target?.closest("[data-radix-popper-content-wrapper]")) return;
            setActive(!!target && !!sectionRef.current?.contains(target));
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, []);

    // A run puts the composer back at rest, so the result has the screen.
    useEffect(() => {
        if (isExecuting) setActive(false);
    }, [isExecuting]);

    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <section
                ref={sectionRef}
                data-floating-composer
                aria-label={`${title} controls`}
                data-active={active}
                className={cn(
                    "group/composer pointer-events-auto w-full max-w-xl rounded-md border shadow-lg transition-[background-color,border-color,box-shadow]",
                    "has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-[3px] has-[textarea:focus-visible]:ring-ring/50",
                    "bg-card/70 backdrop-blur-sm dark:bg-secondary/70",
                    "focus-within:bg-card dark:focus-within:bg-secondary",
                    "data-[active=true]:bg-card dark:data-[active=true]:bg-secondary",
                    "has-[[data-state=open]]:bg-card dark:has-[[data-state=open]]:bg-secondary",
                )}
            >
                {notice && <div className="px-2 pt-2">{notice}</div>}
                <div
                    className={
                        promptClassName ??
                        "max-h-[4.5rem] overflow-y-auto overscroll-contain transition-[max-height] focus-within:max-h-[45vh]"
                    }
                >
                    {prompt}
                </div>
                <div className={cn("flex items-center gap-1 p-2", divided && "border-t")}>
                    {params && (
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
                    )}
                    {tools}
                    <ToolPanelActions
                        viewMode={viewMode}
                        showReset={showReset}
                        showSync={showSync}
                        isExecuting={isExecuting}
                        iconOnly
                        onReset={onReset}
                        onSync={onSync}
                    />
                    <span
                        aria-live="polite"
                        className="min-w-0 flex-1 text-balance px-1 text-right text-xs text-muted-foreground"
                    >
                        {hint}
                    </span>
                    {/* The model gives its name's room to a hint. */}
                    <ModelControl dense side="top" nameHidden={!!hint} className="min-w-0 shrink" />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={cn("group/run text-primary hover:text-primary", runClassName)}
                        aria-label={`Run ${title}`}
                        onClick={onRun}
                        disabled={runDisabled}
                    >
                        {isExecuting ? <Loader2 className="animate-spin" /> : <RunIcon />}
                    </Button>
                </div>
            </section>
        </div>
    );
}

/** Room the page leaves under the chart for the composer at its resting height. */
FloatingToolComposer.PAGE_SPACE = "pb-36";

/** Hides an element while a composer is on the page (the header's model picker). */
FloatingToolComposer.HIDDEN_BESIDE = "[body:has([data-floating-composer])_&]:hidden";

/**
 * Run's glyph: a solid play mark that runs from the button's color into the
 * brand's purple, and leans forward under the pointer or a press.
 */
function RunIcon() {
    const gradient = useId();
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="transition-transform duration-200 group-hover/run:translate-x-0.5 group-hover/run:scale-110 group-active/run:scale-95"
        >
            <defs>
                <linearGradient
                    id={gradient}
                    gradientUnits="userSpaceOnUse"
                    x1="5"
                    y1="4"
                    x2="20"
                    y2="18"
                >
                    <stop offset="0" stopColor="currentColor" />
                    <stop offset="1" className="[stop-color:theme(colors.purple.600)]" />
                </linearGradient>
            </defs>
            <path
                d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"
                fill={`url(#${gradient})`}
            />
        </svg>
    );
}
