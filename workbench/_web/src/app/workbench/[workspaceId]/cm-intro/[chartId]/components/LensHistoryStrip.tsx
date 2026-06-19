"use client";

import { useMemo } from "react";
import type { LensRun } from "@/db/schema";
import { cn } from "@/lib/utils";

/**
 * F1 presenter: one prompt's final-token prediction as a horizontal strip of
 * per-layer cells (one cell per layer, colored by probability), with the
 * prompt text and the model's final-layer token. Stacking several of these
 * aligns layers vertically across prompt versions so a participant can see how
 * the prediction shifts. Click to load this prompt back into the composer.
 */

// Probability → on-brand blue. 0 ≈ background, 1 ≈ primary (217 91% 60%).
function probColor(prob: number): string {
    const p = Math.max(0, Math.min(1, prob));
    const lightness = 96 - p * 46; // 96% (faint) → 50% (saturated)
    return `hsl(217 91% ${lightness}%)`;
}

interface LensHistoryStripProps {
    run: LensRun;
    isActive: boolean;
    onSelect: (prompt: string) => void;
}

export function LensHistoryStrip({ run, isActive, onSelect }: LensHistoryStripProps) {
    const cells = run.data.lastRow.cells;
    const layers = run.data.lastRow.layers;
    const finalToken = run.data.finalToken;

    const promptLabel = useMemo(() => run.prompt.trim() || "(empty prompt)", [run.prompt]);

    return (
        <button
            type="button"
            data-testid="lens-history-strip"
            data-active={isActive ? "true" : "false"}
            onClick={() => onSelect(run.prompt)}
            title={`${promptLabel} → ${finalToken ?? "?"}`}
            className={cn(
                "w-full text-left rounded border px-2 py-1.5 transition-opacity",
                "hover:border-primary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                isActive
                    ? "border-primary bg-primary/5 opacity-100"
                    : "border-border bg-background opacity-70 hover:opacity-100",
            )}
        >
            <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-mono text-xs truncate text-foreground/90">{promptLabel}</span>
                {finalToken && (
                    <span className="font-mono text-xs shrink-0 text-primary">→ {finalToken}</span>
                )}
            </div>
            <div className="flex gap-px" aria-hidden="true">
                {cells.map((cell, i) => (
                    <div
                        key={i}
                        className="h-3 flex-1 min-w-[2px] rounded-[1px]"
                        style={{ backgroundColor: probColor(cell.prob) }}
                        title={`Layer ${layers[i] ?? i}: ${cell.token} (${(cell.prob * 100).toFixed(1)}%)`}
                    />
                ))}
            </div>
        </button>
    );
}
