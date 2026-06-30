/**
 * Patch Lens chart data types.
 *
 * Persisted into the chart row's `data` field when `type = "patch-lens"`.
 * The chart row no longer carries heatmaps: those live in `lens_runs` and are
 * fetched on demand by `activeLensRunId`. This row holds only the prompts, the
 * pending intervention spec, and the pointer to the active run.
 */

export interface PatchLensInterventionSpec {
    srcTokenPos: number;
    srcLayer: number;
    tgtTokenPos: number;
    tgtLayer: number;
}

export interface PatchLensChartData {
    sourcePrompt: string;
    targetPrompt: string;
    // Snapshot of the prompts the active lens run was actually computed from.
    // Distinct from sourcePrompt/targetPrompt (which autosave on every edit) —
    // these only update on a successful lens run, so the UI can hide the
    // predicted-next-token hint when the user starts editing.
    lastRunSourcePrompt?: string;
    lastRunTargetPrompt?: string;
    // When true, send prompts verbatim instead of trimming surrounding
    // whitespace before tokenizing/running (default: false — trim).
    preserveWhitespace?: boolean;
    intervention?: PatchLensInterventionSpec;
    // The lens_runs row this chart's current state came from (the latest run,
    // or the history entry the user restored). Heatmaps are fetched from that
    // row; the intervention mutation also attaches a patch back onto it.
    activeLensRunId?: string;
}
