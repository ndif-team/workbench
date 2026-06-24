/**
 * Shared transform: nnsightful/workbench `LogitLensIntroData` → edulogitlens
 * `LogitLensData` (the `{ tokens, layers, data: LogitCell[][] }` shape its
 * widgets render). Used by the patch-lens display (CausalMediationExplorer) and
 * the prompt-history compare overlay (LogitLensGrid) so both see identical
 * cells.
 */

import type { LogitLensData, LogitCell } from "edulogitlens";
import type { LogitLensIntroData } from "@/types/logitLensIntro";

export function transformToEduFormat(
    data: LogitLensIntroData | undefined | null,
): LogitLensData | undefined {
    if (!data) return undefined;

    const raw = data as unknown as Record<string, unknown>;
    const input = raw.input as string[] | undefined;
    const layers = raw.layers as number[] | undefined;
    const tracked = raw.tracked as Record<string, number[]>[] | undefined;
    const topk = raw.topk as string[][][] | undefined;

    if (!input || !layers || !tracked || !topk) return undefined;

    // NOTE: do NOT strip the BOS token here. CM interventions send the clicked
    // cell's token position to the backend, which indexes the BOS-inclusive
    // tokenization absolutely (causal_mediation.py). Dropping position 0 would
    // patch the wrong token. BOS-hiding for CM must happen in the widget while
    // preserving absolute positions.
    const cellData: LogitCell[][] = input.map((_, posIdx) => {
        const posTracked = tracked[posIdx] ?? {};
        return layers.map((_, layerIdx) => {
            const topTokenStrs = topk[layerIdx]?.[posIdx] ?? [];
            const topTokens = topTokenStrs.map((t) => ({
                token: t,
                prob: posTracked[t]?.[layerIdx] ?? 0,
            }));
            topTokens.sort((a, b) => b.prob - a.prob);

            const best = topTokens[0];
            return {
                token: best?.token ?? "",
                probability: best?.prob ?? 0,
                topTokens,
            };
        });
    });

    return { tokens: input, layers, data: cellData };
}
