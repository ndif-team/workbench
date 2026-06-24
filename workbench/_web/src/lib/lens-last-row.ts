/**
 * Last-row extraction for logit-lens data (shared by D1's collapse toggle and
 * F1's prompt-history strips).
 *
 * A logit-lens result is indexed [layer][position]. For the "final-token"
 * views we only care about the LAST input position: for each layer, the most
 * probable token there and its probability. `extractLastRow` distils the bulky
 * `LogitLensIntroData` (layers × positions × top-k strings + per-token
 * trajectories) down to that compact per-layer strip, which is small enough to
 * persist per history entry.
 */

import type { LogitLensIntroData } from "@/types/logitLensIntro";
import type { LensRunLastRow } from "@/types/lensRun";

/**
 * For the final input position, return the top-1 token + probability at each
 * layer. Returns null if the data is empty/malformed.
 *
 * Generalises the single-layer `getNextTokenPrediction` helper (PatchLensArea):
 * that returns just the final layer's top-1; this returns the whole column.
 */
export function extractLastRow(data: LogitLensIntroData | undefined | null): LensRunLastRow | null {
    if (!data) return null;
    const raw = data as unknown as {
        layers?: number[];
        input?: string[];
        tracked?: Record<string, number[]>[];
        topk?: string[][][];
    };
    const { layers, input, tracked, topk } = raw;
    if (!layers?.length || !input?.length || !tracked?.length || !topk?.length) return null;

    const lastPosIdx = input.length - 1;
    const posTracked = tracked[lastPosIdx] ?? {};

    const cells = layers.map((_, layerIdx) => {
        const candidates = topk[layerIdx]?.[lastPosIdx] ?? [];
        let bestToken = candidates[0] ?? "";
        let bestProb = bestToken ? (posTracked[bestToken]?.[layerIdx] ?? 0) : 0;
        for (const token of candidates) {
            const prob = posTracked[token]?.[layerIdx] ?? 0;
            if (prob > bestProb) {
                bestProb = prob;
                bestToken = token;
            }
        }
        return { token: bestToken, prob: bestProb };
    });

    return { layers: [...layers], cells };
}

/**
 * The final-layer top-1 token — the model's actual next-token prediction.
 * Equivalent to the old `getNextTokenPrediction`, derived from the same strip.
 */
export function finalPrediction(data: LogitLensIntroData | undefined | null): string | null {
    const lastRow = extractLastRow(data);
    if (!lastRow || lastRow.cells.length === 0) return null;
    const final = lastRow.cells[lastRow.cells.length - 1];
    return final.token || null;
}
