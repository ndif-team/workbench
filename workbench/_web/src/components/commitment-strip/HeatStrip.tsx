"use client";

import { useMemo, useState } from "react";
import type { CommitmentStripPayload } from "@/types/workshop";
import {
    COMMITMENT_DEFINITIONS,
    type CommitmentDefinition,
    computeCommitmentLayer,
    finalProbForToken,
    commitmentLayerToColor,
} from "@/lib/commitment-layer";

interface HeatStripProps {
    payload: CommitmentStripPayload;
    /**
     * Optional: a callback that opens the existing single-token logit-lens
     * drill-down for the clicked token. Wired by the parent route since the
     * existing logit-lens panel lives elsewhere in the app.
     */
    onTokenDrillDown?: (positionIdx: number) => void;
}

export function HeatStrip({ payload, onTokenDrillDown }: HeatStripProps) {
    const [definition, setDefinition] = useState<CommitmentDefinition>("top1");

    const computed = useMemo(() => {
        return payload.completion_tokens.map((tok, pos) => {
            const layers = payload.per_position_per_layer_top_k[pos] ?? [];
            const layer = computeCommitmentLayer(tok.id, layers, definition);
            const finalProb = finalProbForToken(tok.id, layers);
            return { tok, pos, layer, finalProb };
        });
    }, [payload.completion_tokens, payload.per_position_per_layer_top_k, definition]);

    const totalLayers = payload.num_layers;

    const showLegend = payload.completion_tokens.length >= 20;

    return (
        <section
            data-testid="commitment-strip"
            data-definition={definition}
            className="flex flex-col gap-3"
        >
            <div className="flex items-center gap-2 flex-wrap" data-testid="commitment-strip-controls">
                <span className="text-xs text-muted-foreground">Commitment definition:</span>
                {COMMITMENT_DEFINITIONS.map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        data-testid={`commitment-strip-def-${opt.value}`}
                        data-active={opt.value === definition ? "true" : "false"}
                        onClick={() => setDefinition(opt.value)}
                        className={
                            opt.value === definition
                                ? "rounded border bg-primary text-primary-foreground px-2 py-0.5 text-xs"
                                : "rounded border px-2 py-0.5 text-xs"
                        }
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            <div
                data-testid="commitment-strip-tokens"
                className="font-mono text-sm flex flex-wrap gap-px leading-relaxed"
            >
                {computed.map(({ tok, pos, layer, finalProb }) => {
                    const bg = commitmentLayerToColor(layer, totalLayers);
                    const tooltip =
                        layer === null
                            ? `Position ${pos}: never committed; final prob ${(finalProb * 100).toFixed(1)}%`
                            : `Position ${pos}: committed at layer ${layer}/${totalLayers - 1}; final prob ${(finalProb * 100).toFixed(1)}%`;
                    return (
                        <button
                            key={pos}
                            type="button"
                            title={tooltip}
                            data-testid={`heat-strip-token-${pos}`}
                            data-commitment-layer={layer === null ? "null" : layer}
                            data-final-prob={finalProb.toFixed(3)}
                            onClick={() => onTokenDrillDown?.(pos)}
                            style={{ backgroundColor: bg }}
                            className="px-1 rounded transition-colors hover:ring-1 hover:ring-primary"
                        >
                            {tok.text}
                        </button>
                    );
                })}
            </div>

            {showLegend && (
                <div
                    data-testid="commitment-strip-legend"
                    className="flex items-center gap-3 text-xs text-muted-foreground"
                >
                    <span>First layer at which the chosen token reached:</span>
                    <span style={{ backgroundColor: commitmentLayerToColor(0, totalLayers) }} className="px-2 rounded">
                        early
                    </span>
                    <span style={{ backgroundColor: commitmentLayerToColor(Math.floor(totalLayers / 2), totalLayers) }} className="px-2 rounded">
                        mid
                    </span>
                    <span style={{ backgroundColor: commitmentLayerToColor(totalLayers - 1, totalLayers) }} className="px-2 rounded">
                        late
                    </span>
                    <span style={{ backgroundColor: commitmentLayerToColor(null, totalLayers) }} className="px-2 rounded">
                        unsettled
                    </span>
                </div>
            )}
        </section>
    );
}
