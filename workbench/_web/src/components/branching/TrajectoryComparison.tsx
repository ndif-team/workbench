"use client";

import { useMemo, useState } from "react";
import {
    computeDivergenceByPosition,
    pluralityTokenAtPosition,
    divergenceToSaturation,
} from "@/lib/branching-divergence";
import type { BranchingGenerationSet, BranchingDrillDown } from "@/types/workshop";
import { BranchDrillDown } from "./BranchDrillDown";

interface TrajectoryComparisonProps {
    payload: BranchingGenerationSet;
    /** Optional: alternates beyond the pre-cached ones (researcher mode). */
    extraDrillDowns?: BranchingDrillDown[];
    /** Researcher-mode hook to fetch a forced-token continuation live. */
    onGenerateAlternate?: (sampleIdx: number, position: number, forcedTokenId: number) => void;
}

interface SelectedToken {
    sampleIdx: number;
    position: number;
}

export function TrajectoryComparison({
    payload,
    extraDrillDowns,
    onGenerateAlternate,
}: TrajectoryComparisonProps) {
    const [selected, setSelected] = useState<SelectedToken | null>(null);

    const divergence = useMemo(
        () => computeDivergenceByPosition(payload.samples),
        [payload.samples],
    );

    const drillDowns = useMemo(
        () => [...payload.drill_downs, ...(extraDrillDowns ?? [])],
        [payload.drill_downs, extraDrillDowns],
    );

    const allIdentical = useMemo(() => {
        if (payload.samples.length < 2) return false;
        const first = payload.samples[0].completion_text;
        return payload.samples.every((s) => s.completion_text === first);
    }, [payload.samples]);

    return (
        <div data-testid="trajectory-comparison" className="flex flex-col gap-3">
            <div className="text-sm text-muted-foreground">
                Prompt:{" "}
                <span className="font-mono text-foreground" data-testid="trajectory-prompt">
                    {payload.prompt}
                </span>
            </div>

            {allIdentical && (
                <div
                    data-testid="trajectory-all-identical"
                    className="rounded border p-3 bg-muted/40 text-sm"
                >
                    All samples identical at these temperatures. Raise temperature to see
                    variation.
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {payload.samples.map((sample, sIdx) => (
                    <div
                        key={sIdx}
                        data-testid={`trajectory-panel-${sIdx}`}
                        className="rounded-md border p-3 bg-card flex flex-col gap-2"
                    >
                        <div className="text-xs text-muted-foreground">
                            T={sample.temperature} · seed={sample.seed}
                        </div>
                        <div className="font-mono text-sm leading-relaxed flex flex-wrap gap-px">
                            {sample.completion_tokens.map((tok, pos) => {
                                const div = divergence[pos] ?? 0;
                                const sat = divergenceToSaturation(div);
                                const plurality = pluralityTokenAtPosition(payload.samples, pos);
                                const differs = plurality !== null && tok.id !== plurality;
                                const borderStyle = differs && sat > 0
                                    ? { boxShadow: `inset 0 -2px 0 0 hsl(var(--primary) / ${sat})` }
                                    : undefined;
                                return (
                                    <button
                                        type="button"
                                        key={pos}
                                        data-testid={`trajectory-token-${sIdx}-${pos}`}
                                        data-divergent={differs ? "true" : "false"}
                                        className="px-1 hover:bg-muted/60 rounded transition-colors text-left"
                                        style={borderStyle}
                                        onClick={() =>
                                            setSelected({ sampleIdx: sIdx, position: pos })
                                        }
                                        title={`Click for top-${
                                            (sample.per_position_top_k[pos] ?? []).length
                                        } alternatives`}
                                    >
                                        {tok.text}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {selected && (
                <BranchDrillDown
                    sample={payload.samples[selected.sampleIdx]}
                    sampleIdx={selected.sampleIdx}
                    branchPosition={selected.position}
                    drillDowns={drillDowns}
                    onGenerateAlternate={
                        onGenerateAlternate
                            ? (forcedTokenId) =>
                                  onGenerateAlternate(
                                      selected.sampleIdx,
                                      selected.position,
                                      forcedTokenId,
                                  )
                            : undefined
                    }
                    onClose={() => setSelected(null)}
                />
            )}
        </div>
    );
}
