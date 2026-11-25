/**
 * Logit Lens Types
 *
 * Data and UI state types are nnsightful's own (`LogitLensData`, `LogitLensUIState`).
 * API-specific config types remain local.
 */

import type { LogitLensUIState } from "nnsightful";
import type { ToolOptionValues } from "./models";

/**
 * Logit lens configuration data
 */
export interface LogitLensConfigData {
    model: string;
    prompt: string;
    topk?: number; // Number of top-k predictions per cell (default: 5)
    includeEntropy?: boolean; // Whether to include entropy data (default: false)
    /** The options the lens takes on this model (`ToolOptions`), such as a
     * looped model's `lens`; unset on a model whose lens takes none. */
    options?: ToolOptionValues;
    // Persisted heatmap UI state (pinned trajectories, selection, layer
    // window, appearance) so the visualization restores across reloads.
    uiState?: LogitLensUIState;
}
