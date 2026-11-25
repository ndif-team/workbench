/**
 * Logit Lens Types
 *
 * Data and UI state types are nnsightful's own (`LogitLensData`, `LogitLensUIState`).
 * API-specific config types remain local.
 */

import type { LogitLensUIState } from "nnsightful";

/**
 * How the logit lens reads a layer visit of a looped model (`Model.looped`):
 * - "logit": projects the state the visit leaves, as the model projects its last
 * - "coda": first runs the layers after the loop, the coda, on that state
 * These are nnsightful's `LoopedLogitLensTool.LENSES`. Other models' lens has
 * one form and takes no such option.
 */
export type LoopedLens = "logit" | "coda";

/** The lens a looped model's run uses when none is picked, as in nnsightful. */
export const DEFAULT_LOOPED_LENS: LoopedLens = "logit";

/**
 * Logit lens configuration data
 */
export interface LogitLensConfigData {
    model: string;
    prompt: string;
    topk?: number; // Number of top-k predictions per cell (default: 5)
    includeEntropy?: boolean; // Whether to include entropy data (default: false)
    lens?: LoopedLens; // Looped models only; unset on any other model
    // Persisted heatmap UI state (pinned trajectories, selection, layer
    // window, appearance) so the visualization restores across reloads.
    uiState?: LogitLensUIState;
}
