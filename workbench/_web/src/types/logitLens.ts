/**
 * Logit Lens Types
 *
 * Data and UI state types are nnsightful's own (`LogitLensData`, `LogitLensUIState`).
 * API-specific config types remain local.
 */

import type { LogitLensUIState } from "nnsightful";

/**
 * Logit lens configuration data
 */
export interface LogitLensConfigData {
    model: string;
    prompt: string;
    topk?: number; // Number of top-k predictions per cell (default: 5)
    includeEntropy?: boolean; // Whether to include entropy data (default: true)
    // Persisted heatmap UI state (pinned trajectories, selection, layer
    // window, appearance) so the visualization restores across reloads.
    uiState?: LogitLensUIState;
}
