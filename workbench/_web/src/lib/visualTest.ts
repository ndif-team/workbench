/**
 * Visual-test (Argos) determinism helpers.
 *
 * The visual regression suite runs against the real NDIF service (see
 * `.github/workflows/e2e.yml`). Real model runs are only *approximately*
 * reproducible: floating-point results drift run-to-run across NDIF hardware,
 * and that drift shows up as pixel noise in the heatmap cell colors and the
 * plotted trajectory/line curves — which makes Argos snapshots flaky even
 * though the UI itself is correct.
 *
 * Rather than mock NDIF away, we keep exercising the real request/response
 * path and only neutralize the non-deterministic *values* right before they
 * reach the visualization widgets, when `NEXT_PUBLIC_VISUAL_TEST` is set:
 *
 *  - Logit-lens heatmap: blank every cell except the final prediction (the
 *    last token of the last layer), and flatten the tracked trajectories so
 *    that one remaining cell's color (and the layer skyline) is stable.
 *  - Activation-patching line plot: flatten the plotted series so the drawn
 *    lines are constant. The chart chrome (axes, mode bar, token selector)
 *    still renders, but the noisy curves are ignored.
 *
 * This flag is `NEXT_PUBLIC_` so it is inlined into the client bundle at build
 * time; it must be present when `next build` runs.
 */

import type { LogitLensData } from "nnsightful";
import type { ActivationPatchingData } from "@/types/activationPatching";

export function isVisualTestMode(): boolean {
    return process.env.NEXT_PUBLIC_VISUAL_TEST === "true";
}

/**
 * Blank all heatmap content except the final-prediction cell (last token of
 * the last layer). Token text at that cell stays real so the snapshot still
 * verifies the model's actual next-token prediction rendered; everything else
 * — including the values that drive cell colors — is zeroed so the image is
 * deterministic.
 */
export function maskLogitLensDataForVisualTest(data: LogitLensData): LogitLensData {
    const lastLayer = data.layers.length - 1;
    const lastPos = data.input.length - 1;

    // topk is indexed [layer][position]; keep only the final-prediction cell.
    const topk = data.topk.map((layerRow, layerIdx) =>
        layerRow.map((cell, pos) => (layerIdx === lastLayer && pos === lastPos ? cell : [""])),
    );

    // Flatten every tracked trajectory to a constant. The final cell reads its
    // probability from here, so this pins its color; blanked cells reference
    // tokens absent from `tracked` and render at probability 0.
    const tracked = data.tracked.map((posMap) => {
        const flat: Record<string, number[]> = {};
        for (const [token, trajectory] of Object.entries(posMap)) {
            flat[token] = trajectory.map(() => 1);
        }
        return flat;
    });

    const entropy = data.entropy?.map((layerRow) => layerRow.map(() => 0));

    return { ...data, topk, tracked, ...(entropy ? { entropy } : {}) };
}

/**
 * Flatten the activation-patching series so the plotted lines are constant and
 * therefore deterministic. Layer count, token labels and chart chrome are left
 * intact — only the curve values are ignored.
 */
export function maskActivationPatchingDataForVisualTest(
    data: ActivationPatchingData,
): ActivationPatchingData {
    const flatten = (grid: number[][]) => grid.map((row) => row.map(() => 0));
    return {
        ...data,
        lines: flatten(data.lines),
        ranks: flatten(data.ranks),
        prob_diffs: flatten(data.prob_diffs),
    };
}
