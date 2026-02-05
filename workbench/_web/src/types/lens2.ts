/**
 * Lens2 Types - LogitLensKit V2 format types for the new visualization
 */

/**
 * Lens2 configuration data (simpler than Lens1 - no separate line/grid)
 */
export interface Lens2ConfigData {
    model: string;
    prompt: string;
    topk?: number;  // Number of top-k predictions per cell (default: 5)
    includeEntropy?: boolean;  // Whether to include entropy data (default: true)
}

/**
 * Lens2 metadata
 */
export interface Lens2Meta {
    version: number;
    timestamp: string;
    model: string;
}

/**
 * Lens2 Data - LogitLensKit V2 format
 */
export interface Lens2Data {
    meta: Lens2Meta;
    layers: number[];
    input: string[];  // Input tokens as strings
    tracked: Record<string, number[]>[];  // Per-position: token -> trajectory
    topk: string[][][];  // [layer][position] -> list of top-k tokens
    entropy?: number[][];  // Optional: [layer][position] -> entropy value
}

/**
 * Lens2 UI State for persisting widget configuration
 */
export interface Lens2UIState {
    chartHeight?: number | null;
    inputTokenWidth?: number;
    cellWidth?: number;
    maxRows?: number | null;
    maxTableWidth?: number | null;
    plotMinLayer?: number;
    colorModes?: string[];
    title?: string;
    colorIndex?: number;
    pinnedGroups?: Array<{
        tokens: string[];
        color: string;
        lineStyle?: { name: string; dash: string };
    }>;
    lastPinnedGroupIndex?: number;
    pinnedRows?: Array<{ pos: number; line: string }>;
    heatmapBaseColor?: string | null;
    heatmapNextColor?: string | null;
    darkMode?: boolean | null;
    showHeatmap?: boolean;
    showChart?: boolean;
    trajectoryMetric?: "probability" | "rank";
}
