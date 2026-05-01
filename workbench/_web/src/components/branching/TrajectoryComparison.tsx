"use client";

import { useMemo, useState } from "react";
import {
    computeDivergenceByPosition,
    pluralityTokenAtPosition,
    divergenceToSaturation,
} from "@/lib/branching-divergence";
import type {
    BranchingGenerationSet,
    BranchingDrillDown as DrillDownData,
    BranchingSample,
} from "@/types/workshop";
import { BranchDrillDown } from "./BranchDrillDown";

interface TrajectoryComparisonProps {
    payload: BranchingGenerationSet;
    /** Optional: alternates beyond the pre-cached ones (researcher mode). */
    extraDrillDowns?: DrillDownData[];
    /**
     * Async hook for "Generate full alternate trajectory". Returns a
     * BranchingDrillDown — the component appends its continuation as a new
     * panel and registers it for future drill-downs at the same branch point.
     */
    generateAlternate?: (input: {
        sampleIdx: number;
        position: number;
        forcedTokenId: number;
        forcedTokenText: string;
    }) => Promise<DrillDownData>;
}

interface SelectedToken {
    sampleIdx: number;
    position: number;
}

export function TrajectoryComparison({
    payload,
    extraDrillDowns,
    generateAlternate,
}: TrajectoryComparisonProps) {
    const [selected, setSelected] = useState<SelectedToken | null>(null);
    const [liveDrillDowns, setLiveDrillDowns] = useState<DrillDownData[]>([]);
    const [alternatePanels, setAlternatePanels] = useState<
        { drillDown: DrillDownData; sampleSnapshot: BranchingSample }[]
    >([]);
    const [generating, setGenerating] = useState(false);

    const divergence = useMemo(
        () => computeDivergenceByPosition(payload.samples),
        [payload.samples],
    );

    const drillDowns = useMemo(
        () => [...payload.drill_downs, ...(extraDrillDowns ?? []), ...liveDrillDowns],
        [payload.drill_downs, extraDrillDowns, liveDrillDowns],
    );

    const allIdentical = useMemo(() => {
        if (payload.samples.length < 2) return false;
        const first = payload.samples[0].completion_text;
        return payload.samples.every((s) => s.completion_text === first);
    }, [payload.samples]);

    const handleGenerateAlternate = async (forcedTokenId: number) => {
        if (!generateAlternate || !selected) return;
        const sample = payload.samples[selected.sampleIdx];
        const topAlt = (sample.per_position_top_k[selected.position] ?? []).find(
            (e) => e.token_id === forcedTokenId,
        );
        const tokenText = topAlt?.token_text ?? "?";
        setGenerating(true);
        try {
            const dd = await generateAlternate({
                sampleIdx: selected.sampleIdx,
                position: selected.position,
                forcedTokenId,
                forcedTokenText: tokenText,
            });
            setLiveDrillDowns((prev) => [...prev, dd]);
            setAlternatePanels((prev) => [
                ...prev,
                {
                    drillDown: dd,
                    sampleSnapshot: {
                        temperature: sample.temperature,
                        seed: sample.seed,
                        completion_text:
                            sample.completion_tokens
                                .slice(0, selected.position)
                                .map((t) => t.text)
                                .join("") +
                            tokenText +
                            dd.continuation_text,
                        completion_tokens: [
                            ...sample.completion_tokens.slice(0, selected.position),
                            {
                                idx: selected.position,
                                id: forcedTokenId,
                                text: tokenText,
                                targetIds: [forcedTokenId],
                            },
                            ...dd.continuation_tokens.map((t, i) => ({
                                ...t,
                                idx: selected.position + 1 + i,
                            })),
                        ],
                        per_position_top_k: dd.per_position_top_k,
                    },
                },
            ]);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error("generateAlternate failed", e);
        } finally {
            setGenerating(false);
        }
    };

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
                                const borderStyle =
                                    differs && sat > 0
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

                {alternatePanels.map((alt, idx) => (
                    <div
                        key={`alt-${idx}`}
                        data-testid={`trajectory-alternate-panel-${idx}`}
                        className="rounded-md border-2 border-dashed border-primary p-3 bg-card flex flex-col gap-2"
                    >
                        <div className="text-xs text-muted-foreground">
                            alternate · sample {alt.drillDown.sample_idx + 1}, position{" "}
                            {alt.drillDown.branch_position} · forced{" "}
                            <span className="font-mono">{alt.drillDown.forced_token_text}</span>
                        </div>
                        <div className="font-mono text-sm leading-relaxed flex flex-wrap gap-px">
                            {alt.sampleSnapshot.completion_tokens.map((tok, pos) => (
                                <span
                                    key={pos}
                                    className={
                                        pos === alt.drillDown.branch_position
                                            ? "px-1 rounded bg-primary/20"
                                            : "px-1"
                                    }
                                >
                                    {tok.text}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {generating && (
                <div
                    data-testid="trajectory-generating"
                    className="text-xs text-muted-foreground"
                >
                    Generating alternate trajectory…
                </div>
            )}

            {selected && (
                <BranchDrillDown
                    sample={payload.samples[selected.sampleIdx]}
                    sampleIdx={selected.sampleIdx}
                    branchPosition={selected.position}
                    drillDowns={drillDowns}
                    onGenerateAlternate={
                        generateAlternate
                            ? (forcedTokenId) => handleGenerateAlternate(forcedTokenId)
                            : undefined
                    }
                    onClose={() => setSelected(null)}
                />
            )}
        </div>
    );
}
