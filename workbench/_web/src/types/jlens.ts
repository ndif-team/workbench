/**
 * J-Lens Types
 *
 * The Jacobian lens (j-lens) reuses the logit-lens data format and widget, so
 * its data and UI-state types are re-exported from nnsightful's LogitLens types.
 * API-specific config types remain local.
 */

import type { LogitLensData, LogitLensUIState } from "nnsightful";

export type JLensData = LogitLensData;
export type JLensUIState = LogitLensUIState;

/**
 * J-Lens metadata
 */
export type JLensMeta = LogitLensData["meta"];

/**
 * J-Lens configuration data (mirrors Lens2 — same prompt/top-k/entropy knobs)
 */
export interface JLensConfigData {
    model: string;
    prompt: string;
    topk?: number; // Number of top-k predictions per cell (default: 5)
    includeEntropy?: boolean; // Whether to include entropy data (default: true)
    // Persisted heatmap UI state (pinned trajectories, selection, layer
    // window, appearance) so the visualization restores across reloads.
    uiState?: LogitLensUIState;
}
