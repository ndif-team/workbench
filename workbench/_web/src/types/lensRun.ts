/**
 * F1 — prompt-history types.
 *
 * One `lens_runs` row is recorded each time a cm-intro lens is run. A run is a
 * *pair*: a source prompt plus an optional target prompt, and (once the user
 * drops a patch on the explorer) an optional intervention.
 *
 * The full `LogitLensData` heatmaps are large, and the rail only needs a
 * compact strip + the final token to render history. So a row is split into two
 * columns:
 *   - `summary` (`LensRunSummary`) — small; the only thing the rail fetches.
 *   - `data` (`LensRunHeatmaps`) — the full per-prompt heatmaps; fetched on
 *     demand (restore / compare overlay) by run id, never bulk-loaded.
 *
 * This feature branch is unmerged, so no rows of any older shape exist in any
 * database — there is no legacy/normalization path to carry.
 */

import type { CMIntroInterventionSpec } from "./cmIntro";
import type { LogitLensIntroData } from "./logitLensIntro";

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

/** One prompt's compact summary inside a run — what the rail renders. */
export interface LensRunPromptSummary {
    prompt: string;
    finalToken: string | null;
    lastRow: LensRunLastRow;
}

/** The compact slice stored on `lens_runs.summary` (rail/list payload). */
export interface LensRunSummary {
    source: LensRunPromptSummary;
    target?: LensRunPromptSummary;
    intervention?: CMIntroInterventionSpec;
    interventionResult?: LensRunPromptSummary;
    params: LensRunParams;
}

/** The full per-prompt heatmaps stored on `lens_runs.data` (fetched on demand). */
export interface LensRunHeatmaps {
    source: LogitLensIntroData;
    target?: LogitLensIntroData;
    interventionResult?: LogitLensIntroData;
}
