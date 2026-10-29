"use client";

import type { NormalizedRun } from "@/lib/lensRun";
import type { LensRunPromptSummary } from "@/types/lensRun";
import { cn } from "@/lib/utils";
import { probColor, shortModelName } from "@/lib/lens-format";

/**
 * F1 presenter: one history *run* — a source prompt plus an optional target
 * prompt (and a patch badge when the run carried an intervention). Each prompt
 * shows its final-token prediction as a horizontal strip of per-layer cells
 * (one cell per layer, colored by probability) and the model's final-layer
 * token. Clicking restores the whole run onto patch-lens.
 */

function PromptResultRow({ label, result }: { label?: string; result: LensRunPromptSummary }) {
    const promptLabel = result.prompt.trim() || "(empty prompt)";
    const { cells, layers } = result.lastRow;
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs truncate text-foreground/90">
                    {label && <span className="mr-1 text-muted-foreground">{label}</span>}
                    {promptLabel}
                </span>
                {result.finalToken && (
                    <span className="font-mono text-xs shrink-0 text-primary">
                        → {result.finalToken}
                    </span>
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
        </div>
    );
}

interface LensHistoryStripProps {
    run: NormalizedRun;
    isActive: boolean;
    onSelect: (run: NormalizedRun) => void;
}

export function LensHistoryStrip({ run, isActive, onSelect }: LensHistoryStripProps) {
    // Short model name (drop the org prefix) — history spans models, so each
    // entry notes which one produced it.
    const modelLabel = shortModelName(run.model);
    const patchLabel = run.intervention
        ? `L${run.intervention.srcLayer}→L${run.intervention.tgtLayer}`
        : null;

    return (
        <button
            type="button"
            data-testid="lens-history-strip"
            data-active={isActive ? "true" : "false"}
            onClick={() => onSelect(run)}
            className={cn(
                "w-full space-y-2 rounded border px-2 py-2 text-left transition-opacity",
                "hover:border-primary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                isActive
                    ? "border-primary bg-primary/5 opacity-100"
                    : "border-border bg-background opacity-70 hover:opacity-100",
            )}
        >
            <PromptResultRow label={run.target ? "src" : undefined} result={run.source} />
            {run.target && <PromptResultRow label="tgt" result={run.target} />}
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground truncate" title={run.model}>
                    {modelLabel}
                </span>
                {patchLabel && (
                    <span className="shrink-0 rounded-sm border border-primary/40 bg-primary/5 px-1 text-xs text-primary">
                        patch {patchLabel}
                    </span>
                )}
            </div>
        </button>
    );
}
