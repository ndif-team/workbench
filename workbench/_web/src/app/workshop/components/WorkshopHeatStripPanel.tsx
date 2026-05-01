"use client";

import { useState } from "react";
import { HeatStrip } from "@/components/commitment-strip/HeatStrip";
import { SingleTokenLogitLensModal } from "@/components/commitment-strip/SingleTokenLogitLensModal";
import type { CommitmentStripPayload } from "@/types/workshop";

interface WorkshopHeatStripPanelProps {
    payload: CommitmentStripPayload;
}

/**
 * Workshop-mode wrapper around HeatStrip. Wires click-through to the
 * per-layer logit-lens modal per spec §2.1 / §2.8 — no NDIF call needed
 * since the fixture has full per-layer top-K.
 */
export function WorkshopHeatStripPanel({ payload }: WorkshopHeatStripPanelProps) {
    const [openPos, setOpenPos] = useState<number | null>(null);

    return (
        <>
            <HeatStrip payload={payload} onTokenDrillDown={(pos) => setOpenPos(pos)} />
            {openPos !== null && (
                <SingleTokenLogitLensModal
                    token={payload.completion_tokens[openPos]}
                    position={openPos}
                    perLayerTopK={payload.per_position_per_layer_top_k[openPos] ?? []}
                    numLayers={payload.num_layers}
                    onClose={() => setOpenPos(null)}
                />
            )}
        </>
    );
}
