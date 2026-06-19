/**
 * F1 — prompt-history types.
 *
 * One `lens_runs` row is recorded each time a cm-intro prompt is successfully
 * run. We persist only the compact final-token strip (`LensRunLastRow`), not
 * the full `LogitLensData`, so a session's history stays cheap to store and
 * fetch. The history rail stacks these strips so a participant can see how
 * successive prompt versions shift the final-token prediction.
 */

/** Which prompt slot in the cm-intro pair produced this run. */
export type LensRunSlot = "source" | "target";

/** Per-layer top-1 token + probability at the final input position. */
export interface LensRunLastRow {
    layers: number[];
    cells: { token: string; prob: number }[];
}

/** Sampling/display params the run was computed with. */
export interface LensRunParams {
    topk?: number;
    includeEntropy?: boolean;
}

/** The jsonb payload stored on a lens_runs row. */
export interface LensRunData {
    slot: LensRunSlot;
    finalToken: string | null;
    lastRow: LensRunLastRow;
    params: LensRunParams;
}
