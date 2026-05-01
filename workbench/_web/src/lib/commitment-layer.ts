import type { TopKLogit } from "@/types/workshop";

export type CommitmentDefinition = "top1" | "top3" | "p_gt_0_5";

export const COMMITMENT_DEFINITIONS: { value: CommitmentDefinition; label: string }[] = [
    { value: "top1", label: "top-1" },
    { value: "top3", label: "top-3" },
    { value: "p_gt_0_5", label: "p > 0.5" },
];

/**
 * Compute the layer at which the chosen token first satisfies the commitment
 * definition AND remains satisfied through the final layer. Returns null if
 * the chosen token never commits in the given window — visualized as the
 * "unsettled" gray state.
 *
 * - top1: chosen token is rank-1 from this layer onward.
 * - top3: chosen token is in top-3 from this layer onward.
 * - p_gt_0_5: chosen token's probability is > 0.5 from this layer onward.
 */
export function computeCommitmentLayer(
    chosenTokenId: number,
    perLayerTopK: TopKLogit[][],
    definition: CommitmentDefinition,
): number | null {
    const numLayers = perLayerTopK.length;

    const satisfiedAtLayer = (layer: number): boolean => {
        const row = perLayerTopK[layer];
        if (!row || row.length === 0) return false;
        if (definition === "top1") return row[0].token_id === chosenTokenId;
        if (definition === "top3") {
            return row.slice(0, 3).some((e) => e.token_id === chosenTokenId);
        }
        // p_gt_0_5
        const found = row.find((e) => e.token_id === chosenTokenId);
        return found ? found.probability > 0.5 : false;
    };

    let firstCommitted: number | null = null;
    for (let layer = 0; layer < numLayers; layer++) {
        if (satisfiedAtLayer(layer)) {
            // Verify it stays committed through the final layer.
            let stays = true;
            for (let l2 = layer; l2 < numLayers; l2++) {
                if (!satisfiedAtLayer(l2)) {
                    stays = false;
                    break;
                }
            }
            if (stays) {
                firstCommitted = layer;
                break;
            }
        }
    }
    return firstCommitted;
}

/**
 * Get the chosen token's final-layer probability (used for tooltips).
 */
export function finalProbForToken(
    chosenTokenId: number,
    perLayerTopK: TopKLogit[][],
): number {
    const last = perLayerTopK[perLayerTopK.length - 1] ?? [];
    const found = last.find((e) => e.token_id === chosenTokenId);
    return found?.probability ?? 0;
}

/**
 * Map a commitment layer (or null) to a CSS color.
 * Continuous gradient: blue (early) → green (mid) → red (late) → gray (unsettled).
 * Returns an HSL string suitable for a background style.
 */
export function commitmentLayerToColor(layer: number | null, totalLayers: number): string {
    if (layer === null) return "hsl(0 0% 75% / 0.5)"; // gray, unsettled
    const ratio = totalLayers > 1 ? layer / (totalLayers - 1) : 0;
    // Map ratio 0..1 to a hue from 220 (blue) to 140 (green) to 0 (red).
    const hue = 220 - 220 * ratio;
    return `hsl(${hue} 70% 60% / 0.55)`;
}
