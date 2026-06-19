/**
 * CM Intro chart data types.
 *
 * Persisted into the chart row's `data` field when `type = "cm-intro"`.
 * `source`/`target` are the per-prompt logit-lens results; `intervention`/`result`
 * are populated after a causal-mediation cell-drop on the explorer.
 */

import type { LogitLensIntroData } from "./logitLensIntro";

export interface CMIntroInterventionSpec {
    srcTokenPos: number;
    srcLayer: number;
    tgtTokenPos: number;
    tgtLayer: number;
}

export interface CMIntroChartData {
    sourcePrompt: string;
    targetPrompt: string;
    source?: LogitLensIntroData;
    target?: LogitLensIntroData;
    // Snapshot of the prompts the persisted lens was actually computed from.
    // Distinct from sourcePrompt/targetPrompt (which autosave on every edit) —
    // these only update on a successful lens run, so the UI can hide the
    // predicted-next-token hint when the user starts editing.
    lastRunSourcePrompt?: string;
    lastRunTargetPrompt?: string;
    intervention?: CMIntroInterventionSpec;
    result?: LogitLensIntroData;
    // D1 density toggle: render only the final-token row across all layers.
    lastRowOnly?: boolean;
}
