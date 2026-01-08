/**
 * Data normalization - converts V2 compact format to internal format
 */

import type {
  WidgetInputData,
  NormalizedData,
  V2InputData,
  CellData,
  TopkItem,
  TrackedTrajectory,
} from "./types";

/**
 * Helper to extract probability trajectory from tracked data
 * (handles both number[] and TrackedTrajectory formats)
 */
function getProbTrajectory(tracked: number[] | TrackedTrajectory | undefined): number[] {
  if (!tracked) return [];
  if (Array.isArray(tracked)) return tracked;
  return tracked.prob || [];
}

/**
 * Check if data is in V2 format
 */
function isV2Format(data: WidgetInputData): data is V2InputData {
  return !("cells" in data) && "topk" in data && "tracked" in data;
}

/**
 * Normalize data from any input format to internal format
 */
export function normalizeData(data: WidgetInputData): NormalizedData {
  // Already in v1 format (has cells)
  if ("cells" in data && data.cells) {
    // Just ensure 'tokens' exists (might be 'input' in hybrid)
    const tokens = data.tokens || data.input || [];
    return {
      layers: data.layers,
      tokens,
      cells: data.cells,
      meta: data.meta || {},
    };
  }

  // V2 compact format: convert to v1
  if (!isV2Format(data)) {
    throw new Error("Invalid data format: expected V1 or V2 format");
  }

  const nLayers = data.layers.length;
  const nPositions = data.input.length;
  const cells: CellData[][] = [];

  for (let pos = 0; pos < nPositions; pos++) {
    const posData: CellData[] = [];
    const trackedAtPos = data.tracked[pos];

    for (let li = 0; li < nLayers; li++) {
      const topkTokens = data.topk[li][pos];
      const topkList: TopkItem[] = [];

      for (let ki = 0; ki < topkTokens.length; ki++) {
        const tok = topkTokens[ki];
        const trajectory = getProbTrajectory(trackedAtPos[tok]);
        const prob = trajectory[li] || 0;
        topkList.push({
          token: tok,
          prob,
          trajectory,
        });
      }

      // Top-1 is first in topk
      const top1 = topkList[0] || { token: "", prob: 0, trajectory: [] };
      posData.push({
        token: top1.token,
        prob: top1.prob,
        trajectory: top1.trajectory,
        topk: topkList,
      });
    }
    cells.push(posData);
  }

  return {
    layers: data.layers,
    tokens: data.input,
    cells,
    meta: data.meta || {},
  };
}
