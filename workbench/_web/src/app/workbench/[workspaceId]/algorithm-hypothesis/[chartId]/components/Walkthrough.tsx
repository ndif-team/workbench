"use client";

import type { ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** One step of a guided walkthrough. */
export interface WalkthroughStep {
    id: string;
    title: string;
    body: ReactNode;
    /** "Do it for me": puts the tool in this step's state. */
    action?: { label: string; run: () => void; disabled?: string };
    /** The step's state is in place (done by hand or by the action). */
    done: boolean;
}

/**
 * A docked, step-by-step walkthrough: one step at a time, each with what to
 * look at, a button that does the step, and a check once it's done.
 */
export function Walkthrough({
    title,
    steps,
    index,
    onIndexChange,
    onClose,
}: {
    title: string;
    steps: WalkthroughStep[];
    index: number;
    onIndexChange: (index: number) => void;
    onClose: () => void;
}) {
    const i = Math.min(Math.max(index, 0), steps.length - 1);
    const step = steps[i];
    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="p-3 border-b flex items-center justify-between">
                <h2 className="text-sm pl-2 font-medium">{title}</h2>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Close walkthrough"
                    onClick={onClose}
                >
                    <X />
                </Button>
            </div>
            <ol className="flex flex-wrap gap-1 border-b px-4 py-2" aria-label="Steps">
                {steps.map((s, k) => (
                    <li key={s.id}>
                        <button
                            type="button"
                            onClick={() => onIndexChange(k)}
                            aria-current={k === i ? "step" : undefined}
                            title={s.title}
                            className={cn(
                                "flex size-6 items-center justify-center rounded-full border text-xs tabular-nums",
                                k === i && "border-primary text-primary ring-1 ring-primary",
                                s.done && "border-transparent bg-primary text-primary-foreground",
                            )}
                        >
                            {s.done ? <Check className="size-3.5" /> : k + 1}
                        </button>
                    </li>
                ))}
            </ol>
            <div
                className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 text-sm"
                aria-live="polite"
            >
                <p className="text-xs text-muted-foreground tabular-nums">
                    Step {i + 1} of {steps.length}
                </p>
                <h3 className="flex items-center gap-2 font-medium">
                    {step.title}
                    {step.done && <Check className="size-4 text-primary" aria-label="Done" />}
                </h3>
                <div className="flex flex-col gap-2 text-sm leading-relaxed">{step.body}</div>
                {step.action && (
                    <div className="flex flex-col items-start gap-1">
                        <Button
                            variant={step.done ? "outline" : "default"}
                            size="sm"
                            disabled={!!step.action.disabled}
                            onClick={step.action.run}
                        >
                            {step.action.label}
                        </Button>
                        {step.action.disabled && (
                            <p className="text-xs text-muted-foreground">{step.action.disabled}</p>
                        )}
                    </div>
                )}
            </div>
            <div className="p-3 border-t flex items-center justify-between">
                <Button
                    variant="ghost"
                    size="sm"
                    disabled={i === 0}
                    onClick={() => onIndexChange(i - 1)}
                >
                    <ChevronLeft />
                    Back
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={i === steps.length - 1}
                    onClick={() => onIndexChange(i + 1)}
                >
                    Next
                    <ChevronRight />
                </Button>
            </div>
        </div>
    );
}
