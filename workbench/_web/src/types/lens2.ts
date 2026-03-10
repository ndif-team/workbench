/**
 * Lens2 Types
 *
 * Data and UI state types are re-exported from nnsightful.
 * API-specific config types remain local.
 */

import type { LogitLensData, LogitLensUIState } from "nnsightful";

export type Lens2Data = LogitLensData;
export type Lens2UIState = LogitLensUIState;

/**
 * Lens2 metadata
 */
export type Lens2Meta = LogitLensData["meta"];

/**
 * Lens2 configuration data (simpler than Lens1 - no separate line/grid)
 */
export interface Lens2ConfigData {
    model: string;
    prompt: string;
    topk?: number;  // Number of top-k predictions per cell (default: 5)
    includeEntropy?: boolean;  // Whether to include entropy data (default: true)
}
