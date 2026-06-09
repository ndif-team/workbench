"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import type { GenerationViewMode } from "@/types/generation";

const OPTIONS: { value: GenerationViewMode; label: string }[] = [
    { value: "text", label: "Text" },
    { value: "tokens", label: "Tokens" },
];

interface TokenTextToggleProps {
    value: GenerationViewMode;
    onChange: (value: GenerationViewMode) => void;
    className?: string;
}

/**
 * Compact segmented control toggling how completions read: plain Text or the
 * model's real Tokens. Panel-wide. A proper radio group — only the selected
 * segment is in the tab order, and arrow keys move between options.
 */
export function TokenTextToggle({ value, onChange, className }: TokenTextToggleProps) {
    const refs = useRef<(HTMLButtonElement | null)[]>([]);

    const move = (dir: 1 | -1) => {
        const idx = OPTIONS.findIndex((o) => o.value === value);
        const next = (idx + dir + OPTIONS.length) % OPTIONS.length;
        onChange(OPTIONS[next].value);
        refs.current[next]?.focus();
    };

    return (
        <div
            role="radiogroup"
            aria-label="Output view"
            className={cn("inline-flex items-center rounded-md bg-muted p-0.5", className)}
            onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                    e.preventDefault();
                    move(1);
                } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                    e.preventDefault();
                    move(-1);
                }
            }}
        >
            {OPTIONS.map((opt, i) => {
                const active = value === opt.value;
                return (
                    <button
                        key={opt.value}
                        ref={(el) => {
                            refs.current[i] = el;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        tabIndex={active ? 0 : -1}
                        onClick={() => onChange(opt.value)}
                        className={cn(
                            "rounded-[5px] px-2.5 py-1 text-xs font-medium outline-none transition-colors",
                            "focus-visible:ring-2 focus-visible:ring-ring/50",
                            active
                                ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
