"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { BranchingSample, BranchingDrillDown as DrillDown } from "@/types/workshop";

interface BranchDrillDownProps {
    sample: BranchingSample;
    sampleIdx: number;
    branchPosition: number;
    /** Pre-cached alternates indexed by (sample_idx, branch_position). */
    drillDowns: DrillDown[];
    /** When the user picks an alternate token id to render the full alternate trajectory. */
    onGenerateAlternate?: (forcedTokenId: number) => void;
    onClose: () => void;
}

export function BranchDrillDown({
    sample,
    sampleIdx,
    branchPosition,
    drillDowns,
    onGenerateAlternate,
    onClose,
}: BranchDrillDownProps) {
    const chosen = sample.completion_tokens[branchPosition];
    const topK = sample.per_position_top_k[branchPosition] ?? [];

    useEffect(() => {
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onEsc);
        return () => document.removeEventListener("keydown", onEsc);
    }, [onClose]);

    const dominantProb = topK[0]?.probability ?? 0;
    const noRealisticAlternatives = dominantProb > 0.99;

    return (
        <aside
            data-testid="branch-drill-down"
            data-sample-idx={sampleIdx}
            data-branch-position={branchPosition}
            className="fixed top-0 right-0 h-full w-full md:w-[480px] bg-background border-l shadow-xl z-40 flex flex-col"
        >
            <header className="flex items-center justify-between border-b p-3">
                <div>
                    <p className="text-sm text-muted-foreground">
                        Sample {sampleIdx + 1} · position {branchPosition}
                    </p>
                    <p className="font-mono">
                        Chosen token: <span className="font-semibold">{chosen?.text ?? "?"}</span>
                    </p>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    data-testid="branch-drill-down-close"
                    onClick={onClose}
                >
                    ✕
                </Button>
            </header>

            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
                {noRealisticAlternatives ? (
                    <div data-testid="drill-down-no-alternatives" className="rounded border p-3 bg-muted/40">
                        <p className="text-sm">
                            No realistic alternatives at this position — the model was nearly
                            certain ({(dominantProb * 100).toFixed(1)}%). Try a different token.
                        </p>
                    </div>
                ) : (
                    topK.map((alt, i) => {
                        const isChosen = chosen?.id === alt.token_id;
                        const dd = drillDowns.find(
                            (d) =>
                                d.sample_idx === sampleIdx &&
                                d.branch_position === branchPosition &&
                                d.forced_token_id === alt.token_id,
                        );
                        return (
                            <div
                                key={alt.token_id}
                                data-testid={`drill-down-alt-${i}`}
                                className="rounded border p-3 flex flex-col gap-2"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="font-mono text-sm">
                                        <span data-testid={`drill-down-alt-${i}-token`}>
                                            {alt.token_text}
                                        </span>
                                        {isChosen && (
                                            <span className="ml-2 text-xs text-muted-foreground">
                                                (chosen)
                                            </span>
                                        )}
                                    </div>
                                    <span
                                        className="text-xs text-muted-foreground"
                                        data-testid={`drill-down-alt-${i}-prob`}
                                    >
                                        {(alt.probability * 100).toFixed(1)}%
                                    </span>
                                </div>
                                {dd && (
                                    <div
                                        data-testid={`drill-down-alt-${i}-preview`}
                                        className="text-xs font-mono text-muted-foreground bg-muted/40 rounded p-2"
                                    >
                                        {dd.continuation_text}
                                    </div>
                                )}
                                {!isChosen && onGenerateAlternate && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        data-testid={`drill-down-alt-${i}-generate`}
                                        onClick={() => onGenerateAlternate(alt.token_id)}
                                    >
                                        Generate full alternate trajectory
                                    </Button>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </aside>
    );
}
