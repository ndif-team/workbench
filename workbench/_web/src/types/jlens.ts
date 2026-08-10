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
    // Whether the run generates multiple tokens. Off = a single prefill pass
    // over the prompt (no generation); defaults off. When true the lens spans
    // prompt + generated tokens (JLensData.completion).
    generate?: boolean;
    // Generation length used when `generate` is on (≥2); defaults to 24. Ignored
    // when `generate` is off, where the run is a single pass (1 token).
    maxNewTokens?: number;
    // Sampling for the generation (only meaningful when maxNewTokens > 1). When
    // `sample` is false the run is greedy/deterministic and the knobs below are
    // ignored; when true they're forwarded to the backend's generate call.
    // `topK` here is the sampling top-k, distinct from `topk` (lens display).
    sample?: boolean;
    temperature?: number;
    topP?: number;
    topK?: number;
    // Persisted heatmap UI state (pinned trajectories, selection, layer
    // window, appearance) so the visualization restores across reloads.
    uiState?: LogitLensUIState;
}
