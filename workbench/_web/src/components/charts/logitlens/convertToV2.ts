/**
 * Convert old workbench heatmap format to LogitLensKit V2 format
 *
 * Old format (GridRow[]):
 * [{
 *   id: "token-idx",
 *   data: [{ x: layer, y: prob, label: predicted_token }, ...],
 *   right_axis_label?: string
 * }, ...]
 *
 * V2 format:
 * {
 *   meta: { version: 2, model: string },
 *   input: string[],
 *   layers: number[],
 *   topk: string[][][],  // [layer][position][k]
 *   tracked: Record<string, number[]>[]  // [position]{token: trajectory}
 * }
 */

export interface OldGridCell {
    x: number;
    y: number;
    label: string;
}

export interface OldGridRow {
    id: string;
    data: OldGridCell[];
    right_axis_label?: string | null;
}

// Tracked trajectory with optional rank data
export interface TrackedTrajectory {
    prob: number[];
    rank?: number[];
}

export interface LogitLensV2Data {
    meta: { version: number; model: string };
    input: string[];
    layers: number[];
    topk: string[][][]; // [layer][position][k]
    tracked: Record<string, number[] | TrackedTrajectory>[]; // [position]{token: trajectory or {prob, rank}}
    entropy?: number[][]; // [layer][position] - entropy values
}

/**
 * Convert old heatmap format to V2 format for the LogitLensWidget
 */
export function convertGridToV2(
    gridData: OldGridRow[],
    model: string = "unknown"
): LogitLensV2Data {
    if (!gridData || gridData.length === 0) {
        return {
            meta: { version: 2, model },
            input: [],
            layers: [],
            topk: [],
            tracked: [],
        };
    }

    // Extract input tokens from row IDs (format: "token-idx")
    const input: string[] = gridData.map((row) => {
        // Row id format is "token-idx", extract the token part
        const parts = row.id.split("-");
        // Remove the last part (idx) and rejoin
        return parts.slice(0, -1).join("-") || row.id;
    });

    // Extract layers from first row's data
    const layers = gridData[0].data.map((cell) => cell.x);
    const nLayers = layers.length;
    const nPositions = gridData.length;

    // Build topk: [layer][position][k]
    // In old format, we only have top-1 (the predicted token)
    const topk: string[][][] = [];
    for (let li = 0; li < nLayers; li++) {
        const layerTopk: string[][] = [];
        for (let pos = 0; pos < nPositions; pos++) {
            const cell = gridData[pos].data[li];
            // Old format only has top-1
            layerTopk.push([cell.label]);
        }
        topk.push(layerTopk);
    }

    // Build tracked: [position]{token: trajectory}
    const tracked: Record<string, number[]>[] = [];
    for (let pos = 0; pos < nPositions; pos++) {
        const posTracked: Record<string, number[]> = {};

        // Get all unique tokens at this position across layers
        const tokens = new Set<string>();
        for (let li = 0; li < nLayers; li++) {
            tokens.add(gridData[pos].data[li].label);
        }

        // Build trajectory for each token
        for (const token of tokens) {
            const trajectory: number[] = [];
            for (let li = 0; li < nLayers; li++) {
                const cell = gridData[pos].data[li];
                if (cell.label === token) {
                    trajectory.push(cell.y);
                } else {
                    // Token not predicted at this layer, use 0
                    trajectory.push(0);
                }
            }
            posTracked[token] = trajectory;
        }

        tracked.push(posTracked);
    }

    return {
        meta: { version: 2, model },
        input,
        layers,
        topk,
        tracked,
    };
}

/**
 * Check if data is already in V2 format
 */
export function isV2Format(data: unknown): data is LogitLensV2Data {
    return (
        typeof data === "object" &&
        data !== null &&
        "meta" in data &&
        "topk" in data &&
        "tracked" in data &&
        Array.isArray((data as LogitLensV2Data).tracked) &&
        (data as LogitLensV2Data).tracked.length > 0 &&
        typeof (data as LogitLensV2Data).tracked[0] === "object"
    );
}

/**
 * Check if data is in old grid format
 */
export function isOldGridFormat(data: unknown): data is OldGridRow[] {
    return (
        Array.isArray(data) &&
        data.length > 0 &&
        "id" in data[0] &&
        "data" in data[0] &&
        Array.isArray(data[0].data) &&
        data[0].data.length > 0 &&
        "label" in data[0].data[0]
    );
}

/**
 * Normalize data to V2 format
 */
export function normalizeToV2(
    data: OldGridRow[] | LogitLensV2Data | null,
    model: string = "unknown"
): LogitLensV2Data | null {
    if (!data) return null;

    if (isV2Format(data)) {
        return data;
    }

    if (isOldGridFormat(data)) {
        return convertGridToV2(data, model);
    }

    return null;
}
