/**
 * LogitLensWidget - Interactive visualization of transformer logit lens data
 *
 * This is a self-contained widget that can be bundled for browser use.
 * It creates a global `LogitLensWidget` function when loaded.
 */

import type {
  WidgetInputData,
  NormalizedData,
  UIState,
  ColumnState,
  WidgetState,
  PinnedGroup,
  PinnedRow,
  DOMHelpers,
  LogitLensWidgetInterface,
  LineStyle,
  CellData,
  SerializedPinnedRow,
  TrajectoryMetric,
  V2InputData,
  WidgetEvents,
  WidgetEventListener,
  AnyWidgetEventListener,
} from "./types";

import {
  LINE_STYLES,
  COLORS,
  MIN_CELL_WIDTH,
  MAX_CELL_WIDTH,
  MIN_CHART_HEIGHT,
  MAX_CHART_HEIGHT,
  DEFAULT_BASE_COLOR,
  DEFAULT_NEXT_COLOR,
  ENTROPY_COLOR_MODE,
} from "./types";
import { normalizeData } from "./normalize";
import { generateStyles, generateHTML } from "./styles";
import {
  escapeHtml,
  niceMax,
  formatPct,
  visualizeSpaces,
  createDOMHelpers,
  getContentFontSizePx,
  getChartMargin,
  getDefaultChartHeight,
  hasSimilarTokensInList,
} from "./utils";
import { drawAllTrajectories, ChartContext } from "./chart";

/**
 * Generate a unique ID for widget instances.
 * Uses crypto.randomUUID when available, falls back to timestamp + random.
 *
 * IMPORTANT: Do NOT use a global counter here. When widget code is embedded
 * in Jupyter notebook cells, each cell gets its own IIFE with a fresh copy
 * of the code. A counter would reset to 0 in each cell, causing ID collisions.
 */
function generateUid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return "ll_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  }
  // Fallback: combine timestamp and random number
  return "ll_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Create a LogitLensWidget instance
 */
export function LogitLensWidget(
  containerArg: string | Element,
  widgetData: WidgetInputData,
  uiState?: UIState
): LogitLensWidgetInterface | undefined {
  const uid = generateUid();

  // Get container element
  let container: Element | null;
  if (typeof containerArg === "string") {
    container = document.querySelector(containerArg);
  } else if (containerArg instanceof Element) {
    container = containerArg;
  } else {
    container = null;
  }

  if (!container) {
    console.error("Container not found:", containerArg);
    return undefined;
  }

  // Normalize data format
  const data: NormalizedData = normalizeData(widgetData);

  // Inject CSS
  const style = document.createElement("style");
  style.textContent = generateStyles(uid);
  document.head.appendChild(style);

  // Inject HTML
  container.innerHTML = generateHTML(uid);

  // Constants derived from data
  const nLayers = data.layers.length;
  const nPositions = data.tokens.length;
  const defaultNextToken = data.cells[nPositions - 1][nLayers - 1].token;

  // Create DOM helpers
  const dom = createDOMHelpers(uid);

  // Initialize state
  const state: WidgetState = {
    chartHeight: uiState?.chartHeight ?? null,
    inputTokenWidth: uiState?.inputTokenWidth ?? 100,
    currentCellWidth: uiState?.cellWidth ?? 44,
    currentMaxRows: uiState?.maxRows ?? null,
    maxTableWidth: uiState?.maxTableWidth ?? null,
    plotMinLayer: Math.max(
      0,
      Math.min(nLayers - 2, uiState?.plotMinLayer ?? 0)
    ),
    currentVisibleIndices: [],
    currentStride: 1,
    openPopupCell: null,
    currentHoverPos: nPositions - 1,
    colorPickerTarget: null,
    pinnedGroups: uiState?.pinnedGroups
      ? JSON.parse(JSON.stringify(uiState.pinnedGroups))
      : [],
    pinnedRows: [],
    lastPinnedGroupIndex: uiState?.lastPinnedGroupIndex ?? -1,
    colorModes: uiState?.colorModes
      ? uiState.colorModes.slice()
      : uiState?.colorMode && uiState.colorMode !== "none"
      ? [uiState.colorMode]
      : uiState?.colorMode === "none"
      ? []
      : ["top", defaultNextToken],
    colorIndex: uiState?.colorIndex ?? 0,
    heatmapBaseColor: uiState?.heatmapBaseColor ?? null,
    heatmapNextColor: uiState?.heatmapNextColor ?? null,
    customTitle: uiState?.title ?? "Logit Lens: Top Predictions by Layer",
    darkModeOverride: uiState?.darkMode ?? null,
    showHeatmap: uiState?.showHeatmap ?? true,
    showChart: uiState?.showChart ?? true,
    linkedWidgets: [],
    isSyncing: false,
    colResizeDrag: { active: false, type: null, startX: 0, startWidth: 0, colIdx: 0 },
    yAxisDrag: { active: false, startX: 0, startWidth: 0 },
    xAxisDrag: { active: false, startY: 0, startHeight: 0 },
    plotMinLayerDrag: {
      active: false,
      startX: 0,
      startMinLayer: 0,
      layerIdx: 0,
      layerXAtStart: 0,
      usableWidth: 0,
      dotRadius: 0,
    },
    rightEdgeDrag: {
      active: false,
      startX: 0,
      startTableWidth: 0,
      hadMaxTableWidth: false,
      startMaxTableWidth: null,
    },
  };

  // ═══════════════════════════════════════════════════════════════
  // EVENT SYSTEM
  // ═══════════════════════════════════════════════════════════════

  // Listeners map: event name -> Set of listener functions
  const listeners = new Map<keyof WidgetEvents, Set<AnyWidgetEventListener>>();

  // Register a listener for an event
  function on<K extends keyof WidgetEvents>(
    event: K,
    listener: WidgetEventListener<K>
  ): void {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event)!.add(listener as AnyWidgetEventListener);
  }

  // Unregister a listener for an event
  function off<K extends keyof WidgetEvents>(
    event: K,
    listener: WidgetEventListener<K>
  ): void {
    const set = listeners.get(event);
    if (set) {
      set.delete(listener as AnyWidgetEventListener);
    }
  }

  // Emit an event to all registered listeners
  function emit<K extends keyof WidgetEvents>(event: K, value: WidgetEvents[K]): void {
    const set = listeners.get(event);
    if (set) {
      for (const listener of set) {
        listener(value);
      }
    }
  }

  // Metric modes
  let trajectoryMetric: TrajectoryMetric = uiState?.trajectoryMetric ?? "probability";

  // Check if data has rank trajectories (V2 format with TrackedTrajectory)
  function hasRankData(): boolean {
    const v2Data = widgetData as V2InputData;
    if (!v2Data.tracked || v2Data.tracked.length === 0) return false;
    // Check if any tracked item has TrackedTrajectory format with rank
    for (const posTracked of v2Data.tracked) {
      for (const val of Object.values(posTracked)) {
        if (typeof val === "object" && "rank" in val && Array.isArray(val.rank)) {
          return true;
        }
      }
    }
    return false;
  }

  // Check if data has entropy values
  function hasEntropyData(): boolean {
    const v2Data = widgetData as V2InputData;
    return Array.isArray(v2Data.entropy) && v2Data.entropy.length > 0;
  }

  // Helper to serialize pinned rows for events
  function getSerializedPinnedRows(): SerializedPinnedRow[] {
    return state.pinnedRows.map((pr) => ({
      pos: pr.pos,
      line: pr.lineStyle.name,
    }));
  }

  // Restore pinned rows from uiState, or auto-pin last row by default
  // Track whether we auto-pinned (so we can also auto-pin the prominent token later)
  let didAutoPinLastRow = false;
  if (uiState?.pinnedRows !== undefined) {
    // Explicit pinnedRows provided (even if empty array) - use it as-is
    state.pinnedRows = uiState.pinnedRows.map((pr) => {
      const lineStyle =
        LINE_STYLES.find((ls) => ls.name === pr.line) || LINE_STYLES[0];
      return { pos: pr.pos, lineStyle };
    });
  } else {
    // No pinnedRows specified - auto-pin the last row by default
    state.pinnedRows = [{ pos: nPositions - 1, lineStyle: LINE_STYLES[0] }];
    didAutoPinLastRow = true;
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPER FUNCTIONS
  // ═══════════════════════════════════════════════════════════════

  function isDarkMode(): boolean {
    if (state.darkModeOverride !== null) {
      return state.darkModeOverride;
    }
    return getComputedStyle(container!).colorScheme === "dark";
  }

  function getActualChartHeight(): number {
    return state.chartHeight !== null
      ? state.chartHeight
      : getDefaultChartHeight(dom);
  }

  function getNextColor(): string {
    const c = COLORS[state.colorIndex % COLORS.length];
    state.colorIndex++;
    return c;
  }

  function getColorForToken(token: string): string | null {
    for (const group of state.pinnedGroups) {
      if (group.tokens.includes(token)) return group.color;
    }
    return null;
  }

  function findGroupForToken(token: string): number {
    for (let i = 0; i < state.pinnedGroups.length; i++) {
      if (state.pinnedGroups[i].tokens.includes(token)) return i;
    }
    return -1;
  }

  function getGroupLabel(group: PinnedGroup): string {
    return group.tokens.map((t) => visualizeSpaces(t)).join("+");
  }

  // Check if token is tracked at a position (has trajectory data)
  function isTokenTracked(token: string, pos: number): boolean {
    const v2Data = widgetData as V2InputData;
    if (v2Data.tracked && v2Data.tracked[pos]) {
      return token in v2Data.tracked[pos];
    }
    // Fallback: check if token appears in any cell's topk
    for (let li = 0; li < data.cells[pos].length; li++) {
      const cellData = data.cells[pos][li];
      if (cellData.token === token) return true;
      for (const item of cellData.topk) {
        if (item.token === token) return true;
      }
    }
    return false;
  }

  // Get probability trajectory for a token, or null if not tracked
  function getTrajectoryForToken(token: string, pos: number): number[] | null {
    // First check if token is in tracked data (V2 format)
    const v2Data = widgetData as V2InputData;
    if (v2Data.tracked && v2Data.tracked[pos]) {
      const trackedItem = v2Data.tracked[pos][token];
      if (!trackedItem) return null; // Not tracked
      if (Array.isArray(trackedItem)) return trackedItem;
      if (typeof trackedItem === "object" && "prob" in trackedItem) {
        return trackedItem.prob;
      }
    }
    // Fallback: search through normalized cells
    for (let li = 0; li < data.cells[pos].length; li++) {
      const cellData = data.cells[pos][li];
      if (cellData.token === token) return cellData.trajectory;
      for (const item of cellData.topk) {
        if (item.token === token) return item.trajectory;
      }
    }
    return null; // Not found = not tracked
  }

  // Get rank trajectory from original V2 data, or null if not tracked/available
  function getRankTrajectoryForToken(token: string, pos: number): number[] | null {
    const v2Data = widgetData as V2InputData;
    if (!v2Data.tracked || !v2Data.tracked[pos]) {
      return null;
    }
    const trackedItem = v2Data.tracked[pos][token];
    if (!trackedItem) {
      return null; // Not tracked
    }
    // TrackedTrajectory format has rank array
    if (typeof trackedItem === "object" && "rank" in trackedItem && Array.isArray(trackedItem.rank)) {
      return trackedItem.rank;
    }
    // No rank data available (token tracked but rank not collected)
    return null;
  }

  // Get trajectory for a token based on current metric mode (prob or rank)
  // Returns null if data is not available
  function getMetricTrajectoryForToken(token: string, pos: number): number[] | null {
    if (trajectoryMetric === "rank") {
      return getRankTrajectoryForToken(token, pos);
    }
    return getTrajectoryForToken(token, pos);
  }

  // Get group trajectory. Returns null only if NO tokens in the group have data.
  // For groups, missing tokens contribute 0 (prob) or are skipped (rank).
  function getGroupTrajectory(group: PinnedGroup, pos: number): number[] | null {
    if (trajectoryMetric === "rank") {
      // For rank, take minimum (best) rank across tokens in group
      const result = data.layers.map(() => Infinity);
      let hasAnyData = false;
      for (const token of group.tokens) {
        const traj = getRankTrajectoryForToken(token, pos);
        if (traj) {
          hasAnyData = true;
          for (let j = 0; j < result.length; j++) {
            if (traj[j] > 0 && traj[j] < result[j]) {
              result[j] = traj[j];
            }
          }
        }
      }
      if (!hasAnyData) return null; // No tokens in group have rank data
      // Replace Infinity with 0 for layers where no token had valid rank
      return result.map(v => v === Infinity ? 0 : v);
    }
    // Default: probability - sum trajectories
    const result = data.layers.map(() => 0);
    let hasAnyData = false;
    for (const token of group.tokens) {
      const traj = getTrajectoryForToken(token, pos);
      if (traj) {
        hasAnyData = true;
        for (let j = 0; j < result.length; j++) {
          result[j] += traj[j];
        }
      }
    }
    if (!hasAnyData) return null; // No tokens in group have trajectory data
    return result;
  }

  function getGroupProbAtLayer(
    group: PinnedGroup,
    pos: number,
    layerIdx: number
  ): number {
    let sum = 0;
    for (const token of group.tokens) {
      const traj = getTrajectoryForToken(token, pos);
      if (traj) {
        sum += traj[layerIdx] || 0;
      }
    }
    return sum;
  }

  function getWinningGroupAtCell(
    pos: number,
    layerIdx: number
  ): PinnedGroup | null {
    const cellData = data.cells[pos][layerIdx];
    const top1Prob = cellData.prob;
    let winningGroup: PinnedGroup | null = null;
    let winningProb = top1Prob;

    for (const group of state.pinnedGroups) {
      const groupProb = getGroupProbAtLayer(group, pos, layerIdx);
      if (groupProb > winningProb) {
        winningProb = groupProb;
        winningGroup = group;
      }
    }
    return winningGroup;
  }

  function findPinnedRow(pos: number): number {
    for (let i = 0; i < state.pinnedRows.length; i++) {
      if (state.pinnedRows[i].pos === pos) return i;
    }
    return -1;
  }

  function getLineStyleForRow(pos: number): LineStyle {
    const idx = findPinnedRow(pos);
    if (idx >= 0) return state.pinnedRows[idx].lineStyle;
    return LINE_STYLES[0];
  }

  function allPinnedGroupsBelowThreshold(pos: number, threshold: number): boolean {
    if (state.pinnedGroups.length === 0) return true;
    for (const group of state.pinnedGroups) {
      const traj = getGroupTrajectory(group, pos);
      if (traj) {
        const maxProb = Math.max(...traj);
        if (maxProb >= threshold) return false;
      }
    }
    return true;
  }

  function findHighestProbToken(pos: number, minLayer: number, minProb: number): string | null {
    let bestToken: string | null = null;
    let bestProb = 0;

    for (let li = minLayer; li < data.cells[pos].length; li++) {
      const cellData = data.cells[pos][li];
      if (cellData.prob > bestProb) {
        bestProb = cellData.prob;
        bestToken = cellData.token;
      }
      for (const item of cellData.topk) {
        if (item.prob > bestProb) {
          bestProb = item.prob;
          bestToken = item.token;
        }
      }
    }

    return bestProb >= minProb ? bestToken : null;
  }

  function getContainerWidth(): number {
    const el = dom.widget();
    const actualWidth = el?.offsetWidth || 900;
    if (state.maxTableWidth !== null) {
      return Math.min(state.maxTableWidth, actualWidth);
    }
    return actualWidth;
  }

  function getActualContainerWidth(): number {
    const el = dom.widget();
    return el?.offsetWidth || 900;
  }

  // ═══════════════════════════════════════════════════════════════
  // COLOR MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  function probToColor(prob: number, baseColor?: string | null): string {
    if (baseColor) {
      const hex = baseColor.replace("#", "");
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);

      if (isDarkMode()) {
        const darkBase = 30;
        const rr = Math.round(darkBase + (r - darkBase) * prob);
        const gg = Math.round(darkBase + (g - darkBase) * prob);
        const bb = Math.round(darkBase + (b - darkBase) * prob);
        return `rgb(${rr},${gg},${bb})`;
      } else {
        const rr = Math.round(255 - (255 - r) * prob);
        const gg = Math.round(255 - (255 - g) * prob);
        const bb = Math.round(255 - (255 - b) * prob);
        return `rgb(${rr},${gg},${bb})`;
      }
    }

    if (isDarkMode()) {
      const rVal = Math.round(30 + (100 - 30) * prob * 0.8);
      const gVal = Math.round(30 + (150 - 30) * prob * 0.6);
      const bVal = Math.round(30 + (255 - 30) * prob);
      return `rgb(${rVal},${gVal},${bVal})`;
    }

    const rVal = Math.round(255 * (1 - prob * 0.8));
    const gVal = Math.round(255 * (1 - prob * 0.6));
    return `rgb(${rVal},${gVal},255)`;
  }

  // ═══════════════════════════════════════════════════════════════
  // LAYOUT COMPUTATION
  // ═══════════════════════════════════════════════════════════════

  function computeVisibleLayers(
    cellWidth: number,
    containerWidth: number
  ): { stride: number; indices: number[] } {
    const availableWidth = containerWidth - state.inputTokenWidth - 1;
    const maxCols = Math.max(1, Math.floor(availableWidth / cellWidth));

    if (maxCols >= nLayers) {
      return {
        stride: 1,
        indices: data.layers.map((_, i) => i),
      };
    }

    const stride =
      maxCols > 1 ? Math.max(1, Math.floor((nLayers - 1) / (maxCols - 1))) : nLayers;

    const indices: number[] = [];
    const lastLayer = nLayers - 1;
    for (let i = lastLayer; i >= 0; i -= stride) {
      indices.unshift(i);
    }

    while (indices.length > maxCols) {
      indices.shift();
    }

    return { stride, indices };
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDERING
  // ═══════════════════════════════════════════════════════════════

  function render(): void {
    buildTable(
      state.currentCellWidth,
      state.currentVisibleIndices,
      state.currentMaxRows,
      state.currentStride
    );
  }

  function updateChartDimensions(): number {
    const table = dom.table();
    const svg = dom.chart();
    if (!table || !svg) return 0;

    const tableWidth = table.offsetWidth;
    svg.setAttribute("width", String(tableWidth));
    svg.setAttribute("height", String(getActualChartHeight()));

    const firstInputCell = table.querySelector(".input-token");
    if (firstInputCell) {
      const tableRect = table.getBoundingClientRect();
      const inputCellRect = firstInputCell.getBoundingClientRect();
      return tableWidth - (inputCellRect.right - tableRect.left);
    }
    return tableWidth - state.inputTokenWidth;
  }

  function buildTable(
    cellWidth: number,
    visibleLayerIndices: number[],
    maxRows: number | null,
    stride?: number
  ): void {
    state.currentVisibleIndices = visibleLayerIndices;
    state.currentMaxRows = maxRows;
    if (stride !== undefined) state.currentStride = stride;

    const table = dom.table();
    if (!table) return;

    const totalTokens = data.tokens.length;
    let visiblePositions: number[];
    if (maxRows === null || maxRows >= totalTokens) {
      visiblePositions = data.tokens.map((_, i) => i);
    } else {
      // Two-pass algorithm to select visible rows:
      // Pass 1: All pinned rows must be visible
      // Pass 2: Fill remaining slots with unpinned rows from bottom to top

      const pinnedPositions = new Set(state.pinnedRows.map((pr) => pr.pos));
      const selectedPositions = new Set<number>();

      // Pass 1: Select all pinned positions (they always get a slot)
      for (const pos of pinnedPositions) {
        if (pos >= 0 && pos < totalTokens) {
          selectedPositions.add(pos);
        }
      }

      // Pass 2: Fill remaining slots with unpinned rows from bottom to top
      const remainingSlots = maxRows - selectedPositions.size;
      if (remainingSlots > 0) {
        let addedCount = 0;
        for (let pos = totalTokens - 1; pos >= 0 && addedCount < remainingSlots; pos--) {
          if (!pinnedPositions.has(pos)) {
            selectedPositions.add(pos);
            addedCount++;
          }
        }
      }

      // Convert to sorted array for proper row ordering
      visiblePositions = Array.from(selectedPositions).sort((a, b) => a - b);
    }

    let html = "<colgroup>";
    html += `<col style="width:${state.inputTokenWidth}px;">`;
    visibleLayerIndices.forEach(() => {
      html += `<col style="width:${cellWidth}px;">`;
    });
    html += "</colgroup>";

    const halfwayCol = Math.floor(visibleLayerIndices.length / 2);

    function getColorForMode(mode: string): string {
      if (mode === "top") return state.heatmapBaseColor || DEFAULT_BASE_COLOR;
      if (mode === ENTROPY_COLOR_MODE) return "#cc6622"; // Burnt orange for entropy
      const groupColor = getColorForToken(mode);
      if (groupColor) return groupColor;
      return state.heatmapNextColor || DEFAULT_NEXT_COLOR;
    }

    // Calculate max entropy for normalization
    let maxEntropy = 0;
    const v2Data = widgetData as V2InputData;
    if (v2Data.entropy) {
      v2Data.entropy.forEach((layerEntropy) => {
        layerEntropy.forEach((e) => {
          if (e > maxEntropy) maxEntropy = e;
        });
      });
    }

    function getProbForMode(mode: string, cellData: CellData, pos: number, li: number): number {
      if (mode === "top") return cellData.prob;
      if (mode === ENTROPY_COLOR_MODE) {
        // Get entropy from V2 data and normalize to 0-1
        if (v2Data.entropy && v2Data.entropy[li] && maxEntropy > 0) {
          const entropy = v2Data.entropy[li][pos] || 0;
          return entropy / maxEntropy;
        }
        return 0;
      }
      const found = cellData.topk.find((t) => t.token === mode);
      return found ? found.prob : 0;
    }

    visiblePositions.forEach((pos, rowIdx) => {
      const tok = data.tokens[pos];
      const isFirstVisibleRow = rowIdx === 0;
      const isPinnedRow = findPinnedRow(pos) >= 0;
      const rowLineStyle = getLineStyleForRow(pos);

      html += "<tr>";

      let inputStyle = `width:${state.inputTokenWidth}px; max-width:${state.inputTokenWidth}px;`;
      if (isPinnedRow) {
        inputStyle += isDarkMode()
          ? " background: #4a4a00; color: #fff;"
          : " background: #fff59d;";
      }

      html += `<td class="input-token${isPinnedRow ? " pinned-row" : ""}" data-pos="${pos}" title="${escapeHtml(tok)}" style="${inputStyle}">`;

      if (isPinnedRow) {
        const miniScale = getContentFontSizePx(dom) / 10;
        const miniWidth = 20 * miniScale;
        const miniHeight = 10 * miniScale;
        const miniStroke = 1.5 * miniScale;
        html += `<svg width="${miniWidth}" height="${miniHeight}" style="vertical-align: middle; margin-right: 2px;">`;
        html += `<line x1="0" y1="${miniHeight / 2}" x2="${miniWidth}" y2="${miniHeight / 2}" stroke="${isDarkMode() ? "#ccc" : "#333"}" stroke-width="${miniStroke}"`;
        if (rowLineStyle.dash) {
          const scaledDash = rowLineStyle.dash
            .split(",")
            .map((v) => parseFloat(v) * miniScale)
            .join(",");
          html += ` stroke-dasharray="${scaledDash}"`;
        }
        html += "/></svg>";
      }

      html += escapeHtml(tok);
      if (isFirstVisibleRow) {
        html += '<div class="resize-handle-input" data-col="-1"></div>';
      }
      html += "</td>";

      visibleLayerIndices.forEach((li, colIdx) => {
        const cellData = data.cells[pos][li];

        let cellProb = 0;
        let winningColor: string | null = null;
        let winningMode: string | null = null;

        if (state.colorModes.length > 0) {
          state.colorModes.forEach((mode) => {
            const modeProb = getProbForMode(mode, cellData, pos, li);
            const wins =
              winningMode === "top"
                ? modeProb >= cellProb
                : mode === "top"
                ? modeProb > cellProb
                : modeProb >= cellProb;
            if (wins) {
              cellProb = modeProb;
              winningColor = getColorForMode(mode);
              winningMode = mode;
            }
          });
        }

        const color =
          state.colorModes.length === 0
            ? isDarkMode()
              ? "#1e1e1e"
              : "#fff"
            : probToColor(cellProb, winningColor);

        // Text color: use contrast color based on probability and dark mode
        const dark = isDarkMode();
        const defaultText = dark ? "#e0e0e0" : "#333";
        const textColor = state.colorModes.length === 0
          ? defaultText
          : cellProb < (dark ? 0.7 : 0.5) ? defaultText : "#fff";

        let pinnedColor = getColorForToken(cellData.token);
        if (!pinnedColor) {
          const winningGroup = getWinningGroupAtCell(pos, li);
          if (winningGroup) pinnedColor = winningGroup.color;
        }
        const pinnedStyle = pinnedColor
          ? `box-shadow: inset 0 0 0 2px ${pinnedColor};`
          : "";

        const isMainPrediction =
          rowIdx === visiblePositions.length - 1 &&
          colIdx === visibleLayerIndices.length - 1;
        const boldStyle = isMainPrediction ? "font-weight: bold;" : "";

        const hasHandle = isFirstVisibleRow && colIdx < halfwayCol;

        html += `<td class="pred-cell${pinnedColor ? " pinned" : ""}" data-pos="${pos}" data-li="${li}" data-col="${colIdx}" style="background:${color}; color:${textColor}; width:${cellWidth}px; max-width:${cellWidth}px; ${pinnedStyle}${boldStyle}">${escapeHtml(cellData.token)}`;
        if (hasHandle) {
          html += `<div class="resize-handle" data-col="${colIdx}"></div>`;
        }
        html += "</td>";
      });
      html += "</tr>";
    });

    html += "<tr>";
    html += `<th class="corner-hdr" style="width:${state.inputTokenWidth}px; max-width:${state.inputTokenWidth}px;">Layer<div class="resize-handle-input" data-col="-1"></div></th>`;
    visibleLayerIndices.forEach((li, colIdx) => {
      const hasHandle = colIdx < halfwayCol;
      html += `<th class="layer-hdr" style="width:${cellWidth}px; max-width:${cellWidth}px;">${data.layers[li]}`;
      if (hasHandle) {
        html += `<div class="resize-handle" data-col="${colIdx}"></div>`;
      }
      html += "</th>";
    });
    html += "</tr>";

    table.innerHTML = html;

    // Attach event listeners
    attachCellListeners();
    attachResizeListeners();

    const chartInnerWidth = updateChartDimensions();
    drawAllTrajectoriesWrapper(null, null, null, chartInnerWidth, state.currentHoverPos);
    updateTitle();
    updateVisibility();

    // Update hint text (listeners attached once during init)
    const hint = dom.resizeHint();
    if (hint) {
      const hintMain =
        state.currentStride > 1
          ? `showing every ${state.currentStride} layers ending at ${nLayers - 1}`
          : `showing all ${nLayers} layers`;
      hint.innerHTML = `<span class="resize-hint-main">${hintMain}</span><span class="resize-hint-extra"> (drag column borders to adjust)</span>`;
    }
  }

  // Chart context for drawing
  const chartContext: ChartContext = {
    uid,
    data,
    state,
    dom,
    isDarkMode,
    getActualChartHeight,
    getGroupTrajectory,
    getGroupLabel,
    getLineStyleForRow,
    getTrajectoryMetric: () => trajectoryMetric,
    closePopup,
    emit,
    getSerializedPinnedRows,
    buildTable,
  };

  function drawAllTrajectoriesWrapper(
    hoverTraj: number[] | null,
    hoverColor: string | null,
    hoverLabel: string | null,
    width: number,
    pos: number
  ): void {
    drawAllTrajectories(chartContext, hoverTraj, hoverColor, hoverLabel, width, pos);
  }

  function updateTitle(): void {
    const titleEl = dom.title();
    if (!titleEl) return;

    // Constrain title width
    if (state.maxTableWidth !== null) {
      titleEl.style.maxWidth = state.maxTableWidth + "px";
    } else {
      titleEl.style.maxWidth = "";
    }
    titleEl.style.whiteSpace = "normal";

    let displayLabel = "";
    let pinnedColor: string | null = null;
    let useColoredBy = true;

    function getLabelForMode(mode: string): string {
      if (mode === "top") return "top prediction";
      if (mode === ENTROPY_COLOR_MODE) return "entropy";
      const groupIdx = findGroupForToken(mode);
      if (groupIdx >= 0) {
        return getGroupLabel(state.pinnedGroups[groupIdx]);
      }
      return visualizeSpaces(mode);
    }

    if (state.colorModes.length === 0) {
      displayLabel = "";
      useColoredBy = false;
    } else if (state.colorModes.length === 1) {
      const mode = state.colorModes[0];
      displayLabel = getLabelForMode(mode);
      if (mode !== "top" && mode !== ENTROPY_COLOR_MODE) {
        const groupIdx = findGroupForToken(mode);
        if (groupIdx >= 0) {
          pinnedColor = state.pinnedGroups[groupIdx].color;
        }
      }
    } else {
      const labels = state.colorModes.map(getLabelForMode);
      displayLabel = labels.join(" and ");
    }

    let btnStyle = pinnedColor ? `background: ${pinnedColor}22;` : "";
    if (state.colorModes.length === 0) {
      btnStyle = "background: transparent; border: none; color: transparent; cursor: pointer;";
      displayLabel = "colored by None";
      useColoredBy = false;
    }

    const labelPrefix = useColoredBy ? "colored by " : "";
    const labelContent = `(${labelPrefix}${escapeHtml(displayLabel)})`;
    titleEl.innerHTML = `<span class="ll-title-text" id="${uid}_title_text" style="cursor: text;">${escapeHtml(state.customTitle)}</span> <span class="color-mode-btn" id="${uid}_color_btn" style="${btnStyle}">${labelContent}</span>`;

    dom.colorBtn()?.addEventListener("click", showColorModeMenu);
    dom.titleText()?.addEventListener("click", startTitleEdit);
  }

  function startTitleEdit(e: Event): void {
    e.stopPropagation();
    const titleTextEl = dom.titleText();
    if (!titleTextEl) return;

    const currentText = state.customTitle;
    const input = document.createElement("input");
    input.type = "text";
    input.value = currentText;
    input.style.cssText = `font-size: var(--ll-title-size, 14px); font-weight: 600; font-family: inherit; border: 1px solid #2196F3; border-radius: 3px; padding: 1px 4px; outline: none; width: ${Math.max(200, titleTextEl.offsetWidth)}px;${isDarkMode() ? " background: #1e1e1e; color: #e0e0e0;" : ""}`;

    titleTextEl.innerHTML = "";
    titleTextEl.appendChild(input);
    input.focus();
    input.select();

    function finishEdit(): void {
      const newTitle = input.value.trim();
      const oldTitle = state.customTitle;
      if (newTitle) {
        state.customTitle = newTitle;
      } else {
        const tokens = data.tokens.slice();
        if (tokens.length > 0 && /^<[^>]+>$/.test(tokens[0].trim())) {
          tokens.shift();
        }
        state.customTitle = tokens.join("");
      }
      updateTitle();
      // Fire event if title changed
      if (state.customTitle !== oldTitle) {
        emit("title", state.customTitle);
      }
    }

    input.addEventListener("blur", finishEdit);
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        input.blur();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        input.value = state.customTitle;
        input.blur();
      }
    });
  }

  function updateVisibility(): void {
    const tableWrapper = dom.tableWrapper();
    const chartContainer = dom.chartContainer();

    if (tableWrapper) {
      tableWrapper.style.display = state.showHeatmap ? "" : "none";
    }
    if (chartContainer) {
      chartContainer.style.display = state.showChart ? "" : "none";
    }

    // Also hide resize hint if heatmap is hidden
    const resizeHint = dom.resizeHint();
    if (resizeHint) {
      resizeHint.style.display = state.showHeatmap ? "" : "none";
    }
  }

  function showColorModeMenu(e: Event): void {
    e.stopPropagation();
    closePopup();
    state.colorPickerTarget = null;

    const menu = dom.colorMenu();
    if (!menu) return;

    if (menu.classList.contains("visible")) {
      menu.classList.remove("visible");
      return;
    }

    const btn = e.target as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const containerRect = dom.widget()!.getBoundingClientRect();

    menu.style.left = `${rect.left - containerRect.left}px`;
    menu.style.top = `${rect.bottom - containerRect.top + 5}px`;

    const lastPos = data.tokens.length - 1;
    const lastLayerIdx = state.currentVisibleIndices[state.currentVisibleIndices.length - 1];
    const topToken = data.cells[lastPos][lastLayerIdx].token;

    // Build menu
    interface MenuItem {
      mode: string;
      label: string;
      color: string;
      colorType: "heatmap" | "heatmapNext" | "trajectory";
      groupIdx: number | null;
      borderColor?: string;
    }

    const menuItems: MenuItem[] = [];

    menuItems.push({
      mode: "top",
      label: "top prediction",
      color: state.heatmapBaseColor || DEFAULT_BASE_COLOR,
      colorType: "heatmap",
      groupIdx: null,
    });

    // Add entropy option if entropy data is available
    if (hasEntropyData()) {
      menuItems.push({
        mode: ENTROPY_COLOR_MODE,
        label: "entropy",
        color: "#cc6622",
        colorType: "heatmap",
        groupIdx: null,
      });
    }

    if (findGroupForToken(topToken) < 0) {
      menuItems.push({
        mode: topToken,
        label: topToken,
        color: state.heatmapNextColor || DEFAULT_NEXT_COLOR,
        colorType: "heatmapNext",
        groupIdx: null,
      });
    }

    state.pinnedGroups.forEach((group, idx) => {
      const label = getGroupLabel(group);
      menuItems.push({
        mode: group.tokens[0],
        label,
        color: group.color,
        colorType: "trajectory",
        groupIdx: idx,
        borderColor: group.color,
      });
    });

    let html = "";
    menuItems.forEach((item, idx) => {
      const isActive = state.colorModes.includes(item.mode);
      const borderStyle = item.borderColor ? `border-left: 3px solid ${item.borderColor};` : "";
      const checkmark = isActive
        ? '<span style="padding: 8px 10px 8px 20px; font-weight: bold;">✓</span>'
        : '<span style="padding: 8px 10px 8px 20px; visibility: hidden;">✓</span>';
      html += `<div class="color-menu-item" data-mode="${escapeHtml(item.mode)}" data-idx="${idx}" style="${borderStyle}">`;
      html += checkmark + `<span class="color-menu-label">${escapeHtml(item.label)}</span>`;
      html += `<input type="color" class="color-swatch" value="${item.color}" data-idx="${idx}" style="border:0;background:transparent;padding:0;">`;
      html += "</div>";
    });

    const noneActive = state.colorModes.length === 0;
    const noneCheckmark = noneActive
      ? '<span style="padding: 8px 10px 8px 20px; font-weight: bold;">✓</span>'
      : '<span style="padding: 8px 10px 8px 20px; visibility: hidden;">✓</span>';
    html += `<div class="color-menu-item" data-mode="none" style="border-top: 1px solid #eee; margin-top: 4px;">${noneCheckmark}<span class="color-menu-label">None</span></div>`;

    menu.innerHTML = html;
    menu.classList.add("visible");
    showOverlay(closeColorModeMenu);

    // Menu item click handlers
    menu.querySelectorAll(".color-menu-item").forEach((item) => {
      item.addEventListener("click", (ev: Event) => {
        const mouseEvent = ev as MouseEvent;
        if ((mouseEvent.target as HTMLElement).classList.contains("color-swatch")) return;
        mouseEvent.stopPropagation();

        const mode = (item as HTMLElement).dataset.mode || "";
        const isModifierClick = mouseEvent.shiftKey || mouseEvent.ctrlKey || mouseEvent.metaKey;

        if (isModifierClick && mode !== "none") {
          const idx = state.colorModes.indexOf(mode);
          if (idx >= 0) {
            state.colorModes.splice(idx, 1);
          } else {
            state.colorModes.push(mode);
          }
          buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
          return;
        }

        (item as HTMLElement).style.animation = `menuBlink-${uid} 0.2s ease-in-out`;
        setTimeout(() => {
          if (mode === "none") {
            state.colorModes = [];
          } else {
            state.colorModes = [mode];
          }
          menu.classList.remove("visible");
          buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
        }, 200);
      });
    });

    // Color swatch handlers
    menu.querySelectorAll(".color-swatch").forEach((swatch) => {
      const idx = parseInt((swatch as HTMLElement).dataset.idx || "0");
      const itemData = menuItems[idx];
      const menuItem = (swatch as HTMLElement).closest(".color-menu-item");

      swatch.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (menuItem) menuItem.classList.add("picking");
      });

      swatch.addEventListener("input", (ev) => {
        ev.stopPropagation();
        const newColor = (swatch as HTMLInputElement).value;

        if (itemData.colorType === "heatmap") {
          state.heatmapBaseColor = newColor;
        } else if (itemData.colorType === "heatmapNext") {
          state.heatmapNextColor = newColor;
        } else if (itemData.colorType === "trajectory" && itemData.groupIdx !== null) {
          state.pinnedGroups[itemData.groupIdx].color = newColor;
          if (menuItem) (menuItem as HTMLElement).style.borderLeftColor = newColor;
        }
        buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
      });

      swatch.addEventListener("change", () => {
        if (menuItem) menuItem.classList.remove("picking");
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // POPUP AND OVERLAY
  // ═══════════════════════════════════════════════════════════════

  function closePopup(): void {
    const popup = dom.popup();
    if (popup) popup.classList.remove("visible");
    document.querySelectorAll(`#${uid} .pred-cell.selected`).forEach((c) => {
      c.classList.remove("selected");
    });
    state.openPopupCell = null;
    removeOverlay();
  }

  function closeColorModeMenu(): void {
    const menu = dom.colorMenu();
    if (menu) menu.classList.remove("visible");
    removeOverlay();
  }

  function showOverlay(onDismiss: () => void): void {
    removeOverlay();
    const overlay = document.createElement("div");
    overlay.id = `${uid}_overlay`;
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:50;";
    overlay.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      onDismiss();
    });
    document.body.appendChild(overlay);
  }

  function removeOverlay(): void {
    const overlay = dom.overlay();
    if (overlay) overlay.remove();
  }

  function showPopup(cell: HTMLElement, pos: number, li: number, cellData: CellData): void {
    closeColorModeMenu();
    state.colorPickerTarget = null;
    state.openPopupCell = { pos, li };

    const popup = dom.popup();
    if (!popup) return;

    const rect = cell.getBoundingClientRect();
    const containerRect = dom.widget()!.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const gap = 5;

    // Default: position to the right of the cell
    popup.style.left = `${rect.left - containerRect.left + rect.width + gap}px`;
    popup.style.top = `${rect.top - containerRect.top}px`;

    const popupLayer = dom.popupLayer();
    const popupPos = dom.popupPos();
    const popupContent = dom.popupContent();
    if (popupLayer) popupLayer.textContent = String(data.layers[li]);
    if (popupPos) {
      popupPos.innerHTML = `${pos}<br>Input <code>${escapeHtml(visualizeSpaces(data.tokens[pos]))}</code>`;
    }

    let contentHtml = "";
    cellData.topk.forEach((item, ki) => {
      const probPct = (item.prob * 100).toFixed(1);
      const pinnedColor = getColorForToken(item.token);
      const pinnedStyle = pinnedColor ? `background: ${pinnedColor}22; border-left-color: ${pinnedColor};` : "";
      const visualizedToken = visualizeSpaces(item.token);
      const tooltipToken = visualizeSpaces(item.token, true);
      contentHtml += `<div class="topk-item${pinnedColor ? " pinned" : ""}" data-ki="${ki}" style="${pinnedStyle}" title="${escapeHtml(tooltipToken)}">`;
      contentHtml += `<span class="topk-token">${escapeHtml(visualizedToken)}</span>`;
      contentHtml += `<span class="topk-prob">${probPct}%</span>`;
      contentHtml += "</div>";
    });

    const firstToken = cellData.topk[0].token;
    const firstIsPinned = findGroupForToken(firstToken) >= 0;
    if (firstIsPinned && hasSimilarTokensInList(cellData.topk, firstToken)) {
      contentHtml += '<div style="font-size: var(--ll-content-size, 14px); font-style: italic; color: #666; margin-top: 8px; padding-top: 6px; border-top: 1px solid #eee;">Shift-click to group tokens</div>';
    }

    if (popupContent) popupContent.innerHTML = contentHtml;

    document.querySelectorAll(`#${uid}_popup_content .topk-item`).forEach((item) => {
      const ki = parseInt((item as HTMLElement).dataset.ki || "0");
      const tokData = cellData.topk[ki];

      item.addEventListener("mouseenter", () => {
        document.querySelectorAll(`#${uid}_popup_content .topk-item`).forEach((it) => {
          it.classList.remove("active");
        });
        item.classList.add("active");
        const chartInnerWidth = updateChartDimensions();
        const hoverTraj = getMetricTrajectoryForToken(tokData.token, pos);
        drawAllTrajectoriesWrapper(hoverTraj, "#999", tokData.token, chartInnerWidth, pos);
      });

      item.addEventListener("mouseleave", () => {
        item.classList.remove("active");
        const chartInnerWidth = updateChartDimensions();
        drawAllTrajectoriesWrapper(null, null, null, chartInnerWidth, pos);
      });

      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const addToGroup = (e as MouseEvent).shiftKey || (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey;
        togglePinnedTrajectory(tokData.token, addToGroup);
        buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
        const newCell = document.querySelector(`#${uid} .pred-cell[data-pos='${pos}'][data-li='${li}']`) as HTMLElement;
        if (newCell) {
          newCell.classList.add("selected");
          showPopup(newCell, pos, li, cellData);
        }
      });
    });

    popup.classList.add("visible");

    // After popup is visible, check if it clips the right edge and reposition if needed
    const popupRect = popup.getBoundingClientRect();
    if (popupRect.right > viewportWidth && rect.left - gap - popupRect.width >= 0) {
      // Reposition to the left of the cell
      popup.style.left = `${rect.left - containerRect.left - popupRect.width - gap}px`;
    }

    showOverlay(closePopup);
    const chartInnerWidth = updateChartDimensions();
    const hoverTraj = getMetricTrajectoryForToken(cellData.token, pos);
    drawAllTrajectoriesWrapper(hoverTraj, "#999", cellData.token, chartInnerWidth, pos);
  }

  function togglePinnedTrajectory(token: string, addToGroup: boolean): boolean {
    const existingGroupIdx = findGroupForToken(token);

    if (addToGroup && state.lastPinnedGroupIndex >= 0 && state.lastPinnedGroupIndex < state.pinnedGroups.length) {
      const lastGroup = state.pinnedGroups[state.lastPinnedGroupIndex];

      if (existingGroupIdx === state.lastPinnedGroupIndex) {
        lastGroup.tokens = lastGroup.tokens.filter((t) => t !== token);
        if (lastGroup.tokens.length === 0) {
          state.pinnedGroups.splice(state.lastPinnedGroupIndex, 1);
          state.lastPinnedGroupIndex = state.pinnedGroups.length - 1;
        }
        emit("pinnedGroups", JSON.parse(JSON.stringify(state.pinnedGroups)));
        return false;
      } else if (existingGroupIdx >= 0) {
        state.pinnedGroups[existingGroupIdx].tokens = state.pinnedGroups[existingGroupIdx].tokens.filter((t) => t !== token);
        if (state.pinnedGroups[existingGroupIdx].tokens.length === 0) {
          state.pinnedGroups.splice(existingGroupIdx, 1);
          if (state.lastPinnedGroupIndex > existingGroupIdx) state.lastPinnedGroupIndex--;
        }
        lastGroup.tokens.push(token);
        emit("pinnedGroups", JSON.parse(JSON.stringify(state.pinnedGroups)));
        return true;
      } else {
        lastGroup.tokens.push(token);
        emit("pinnedGroups", JSON.parse(JSON.stringify(state.pinnedGroups)));
        return true;
      }
    } else {
      if (existingGroupIdx >= 0) {
        const group = state.pinnedGroups[existingGroupIdx];
        group.tokens = group.tokens.filter((t) => t !== token);
        if (group.tokens.length === 0) {
          state.pinnedGroups.splice(existingGroupIdx, 1);
          if (state.lastPinnedGroupIndex >= state.pinnedGroups.length) {
            state.lastPinnedGroupIndex = state.pinnedGroups.length - 1;
          }
        }
        emit("pinnedGroups", JSON.parse(JSON.stringify(state.pinnedGroups)));
        return false;
      } else {
        const newGroup: PinnedGroup = { color: getNextColor(), tokens: [token] };
        state.pinnedGroups.push(newGroup);
        state.lastPinnedGroupIndex = state.pinnedGroups.length - 1;
        emit("pinnedGroups", JSON.parse(JSON.stringify(state.pinnedGroups)));
        return true;
      }
    }
  }

  function togglePinnedRow(pos: number): boolean {
    const idx = findPinnedRow(pos);
    let groupChanged = false;
    if (idx >= 0) {
      state.pinnedRows.splice(idx, 1);
      emit("pinnedRows", getSerializedPinnedRows());
      return false;
    } else {
      if (allPinnedGroupsBelowThreshold(pos, 0.01)) {
        const bestToken = findHighestProbToken(pos, 2, 0.05);
        if (bestToken && findGroupForToken(bestToken) < 0) {
          const newGroup: PinnedGroup = { color: getNextColor(), tokens: [bestToken] };
          state.pinnedGroups.push(newGroup);
          state.lastPinnedGroupIndex = state.pinnedGroups.length - 1;
          groupChanged = true;
        }
      }
      const styleIdx = state.pinnedRows.length % LINE_STYLES.length;
      state.pinnedRows.push({ pos, lineStyle: LINE_STYLES[styleIdx] });
      emit("pinnedRows", getSerializedPinnedRows());
      if (groupChanged) {
        emit("pinnedGroups", JSON.parse(JSON.stringify(state.pinnedGroups)));
      }
      return true;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // EVENT LISTENERS
  // ═══════════════════════════════════════════════════════════════

  function attachCellListeners(): void {
    const table = dom.table();
    if (!table) return;

    // Hover handlers
    table.querySelectorAll(".pred-cell, .input-token").forEach((cell) => {
      const pos = parseInt((cell as HTMLElement).dataset.pos || "0", 10);
      if (isNaN(pos)) return;
      const isInputToken = cell.classList.contains("input-token");

      cell.addEventListener("mouseenter", () => {
        state.currentHoverPos = pos;
        emit("hover", pos);
        const chartInnerWidth = updateChartDimensions();

        if (isInputToken) {
          const bestToken = findHighestProbToken(pos, 2, 0.05);
          if (bestToken && findGroupForToken(bestToken) < 0) {
            const traj = getMetricTrajectoryForToken(bestToken, pos);
            drawAllTrajectoriesWrapper(traj, "#999", bestToken, chartInnerWidth, pos);
          } else {
            drawAllTrajectoriesWrapper(null, null, null, chartInnerWidth, pos);
          }
        } else {
          const li = parseInt((cell as HTMLElement).dataset.li || "0", 10);
          const cellData = data.cells[pos][li] || data.cells[pos][0];
          const hoverTraj = getMetricTrajectoryForToken(cellData.token, pos);
          drawAllTrajectoriesWrapper(hoverTraj, "#999", cellData.token, chartInnerWidth, pos);
        }
      });

      cell.addEventListener("mouseleave", () => {
        emit("hover", null);
        const chartInnerWidth = updateChartDimensions();
        drawAllTrajectoriesWrapper(null, null, null, chartInnerWidth, state.currentHoverPos);
      });
    });

    // Input token click (row pinning)
    table.querySelectorAll(".input-token").forEach((cell) => {
      const pos = parseInt((cell as HTMLElement).dataset.pos || "0", 10);
      if (isNaN(pos)) return;

      cell.addEventListener("click", (e) => {
        e.stopPropagation();
        closePopup();
        dom.colorMenu()?.classList.remove("visible");
        togglePinnedRow(pos);
        buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
      });
    });

    // Prediction cell click (popup)
    table.querySelectorAll(".pred-cell").forEach((cell) => {
      const pos = parseInt((cell as HTMLElement).dataset.pos || "0", 10);
      const li = parseInt((cell as HTMLElement).dataset.li || "0", 10);
      const cellData = data.cells[pos][li];

      cell.addEventListener("click", (e) => {
        e.stopPropagation();
        const mouseEvent = e as MouseEvent;

        if (mouseEvent.shiftKey) {
          togglePinnedTrajectory(cellData.token, true);
          buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
          return;
        }

        const colorMenu = dom.colorMenu();
        if (colorMenu?.classList.contains("visible")) {
          colorMenu.classList.remove("visible");
          return;
        }

        if (state.openPopupCell) {
          closePopup();
          return;
        }

        document.querySelectorAll(`#${uid} .pred-cell.selected`).forEach((c) => {
          c.classList.remove("selected");
        });
        cell.classList.add("selected");
        showPopup(cell as HTMLElement, pos, li, cellData);
      });
    });

    dom.popupClose()?.addEventListener("click", closePopup);
  }

  function attachResizeListeners(): void {
    // Input column resize
    document.querySelectorAll(`#${uid} .resize-handle-input`).forEach((handle) => {
      handle.addEventListener("mousedown", (e: Event) => {
        closePopup();
        const mouseEvent = e as MouseEvent;
        state.colResizeDrag = {
          active: true,
          type: "input",
          startX: mouseEvent.clientX,
          startWidth: state.inputTokenWidth,
          colIdx: 0,
        };
        (handle as HTMLElement).classList.add("dragging");
        mouseEvent.preventDefault();
        mouseEvent.stopPropagation();
      });
    });

    // Cell column resize
    document.querySelectorAll(`#${uid} .resize-handle`).forEach((handle) => {
      const colIdx = parseInt((handle as HTMLElement).dataset.col || "0", 10);
      handle.addEventListener("mousedown", (e: Event) => {
        closePopup();
        const mouseEvent = e as MouseEvent;
        state.colResizeDrag = {
          active: true,
          type: "cell",
          startX: mouseEvent.clientX,
          startWidth: state.currentCellWidth,
          colIdx,
        };
        (handle as HTMLElement).classList.add("dragging");
        mouseEvent.preventDefault();
        mouseEvent.stopPropagation();
      });
    });
  }

  // Global mouse handlers
  document.addEventListener("mousemove", (e) => {
    // Column resize
    if (state.colResizeDrag.active) {
      const delta = e.clientX - state.colResizeDrag.startX;

      if (state.colResizeDrag.type === "input") {
        state.inputTokenWidth = Math.max(40, Math.min(200, state.colResizeDrag.startWidth + delta));
        const result = computeVisibleLayers(state.currentCellWidth, getContainerWidth());
        buildTable(state.currentCellWidth, result.indices, state.currentMaxRows, result.stride);
        notifyLinkedWidgets();
      } else if (state.colResizeDrag.type === "cell") {
        const numCols = state.colResizeDrag.colIdx + 1;
        const widthDelta = delta / numCols;
        const newWidth = Math.max(MIN_CELL_WIDTH, Math.min(MAX_CELL_WIDTH, state.colResizeDrag.startWidth + widthDelta));
        if (Math.abs(newWidth - state.currentCellWidth) > 1) {
          state.currentCellWidth = newWidth;
          const result = computeVisibleLayers(state.currentCellWidth, getContainerWidth());
          buildTable(state.currentCellWidth, result.indices, state.currentMaxRows, result.stride);
          notifyLinkedWidgets();
        }
      }
    }

    // Y-axis drag
    if (state.yAxisDrag.active) {
      const delta = e.clientX - state.yAxisDrag.startX;
      state.inputTokenWidth = Math.max(40, Math.min(200, state.yAxisDrag.startWidth + delta));
      const result = computeVisibleLayers(state.currentCellWidth, getContainerWidth());
      buildTable(state.currentCellWidth, result.indices, state.currentMaxRows, result.stride);
      notifyLinkedWidgets();
    }

    // X-axis drag (chart height)
    if (state.xAxisDrag.active) {
      const delta = e.clientY - state.xAxisDrag.startY;
      const newHeight = Math.max(MIN_CHART_HEIGHT, Math.min(MAX_CHART_HEIGHT, state.xAxisDrag.startHeight + delta));
      const currentHeight = getActualChartHeight();
      if (Math.abs(newHeight - currentHeight) > 2) {
        state.chartHeight = newHeight;
        const svg = dom.chart();
        if (svg) svg.setAttribute("height", String(state.chartHeight));
        const chartInnerWidth = updateChartDimensions();
        drawAllTrajectoriesWrapper(null, null, null, chartInnerWidth, state.currentHoverPos);
      }
    }

    // Plot min layer drag
    if (state.plotMinLayerDrag.active) {
      const delta = e.clientX - state.plotMinLayerDrag.startX;
      const dr = state.plotMinLayerDrag.dotRadius;
      const uw = state.plotMinLayerDrag.usableWidth;
      const layerIdx = state.plotMinLayerDrag.layerIdx;
      let targetX = state.plotMinLayerDrag.layerXAtStart + delta;
      targetX = Math.max(dr, Math.min(uw - dr, targetX));

      const t = (targetX - dr) / (uw - 2 * dr);
      if (Math.abs(t - 1) < 0.001) return;
      let newMinLayer = (t * (nLayers - 1) - layerIdx) / (t - 1);
      newMinLayer = Math.max(0, Math.min(layerIdx - 0.1, newMinLayer));

      if (Math.abs(newMinLayer - state.plotMinLayer) > 0.01) {
        state.plotMinLayer = newMinLayer;
        const chartInnerWidth = updateChartDimensions();
        drawAllTrajectoriesWrapper(null, null, null, chartInnerWidth, state.currentHoverPos);
      }
    }

    // Right edge drag
    if (state.rightEdgeDrag.active) {
      const delta = e.clientX - state.rightEdgeDrag.startX;
      const actualContainerWidth = getActualContainerWidth();
      let targetTableWidth = state.rightEdgeDrag.startTableWidth + delta;

      if (delta >= 0) {
        targetTableWidth = Math.min(targetTableWidth, actualContainerWidth);
        if (targetTableWidth >= actualContainerWidth - state.currentCellWidth) {
          state.maxTableWidth = null;
        } else {
          state.maxTableWidth = targetTableWidth;
        }
        const availableForCells = targetTableWidth - state.inputTokenWidth - 1;
        let numVisibleCols = state.currentVisibleIndices.length;
        if (numVisibleCols > 0) {
          let newCellWidth = availableForCells / numVisibleCols;
          if (newCellWidth > MAX_CELL_WIDTH && numVisibleCols < nLayers) {
            numVisibleCols++;
            newCellWidth = availableForCells / numVisibleCols;
          }
          newCellWidth = Math.max(MIN_CELL_WIDTH, Math.min(MAX_CELL_WIDTH, newCellWidth));
          const threshold = 0.5 / Math.max(1, numVisibleCols);
          if (Math.abs(newCellWidth - state.currentCellWidth) > threshold) {
            state.currentCellWidth = newCellWidth;
            const result = computeVisibleLayers(state.currentCellWidth, getContainerWidth());
            buildTable(state.currentCellWidth, result.indices, state.currentMaxRows, result.stride);
            notifyLinkedWidgets();
          }
        }
      } else {
        targetTableWidth = Math.max(state.inputTokenWidth + MIN_CELL_WIDTH + 1, targetTableWidth);
        if (!state.rightEdgeDrag.hadMaxTableWidth && targetTableWidth >= state.rightEdgeDrag.startTableWidth) {
          state.maxTableWidth = null;
        } else {
          state.maxTableWidth = targetTableWidth;
        }
        const result = computeVisibleLayers(state.currentCellWidth, getContainerWidth());
        buildTable(state.currentCellWidth, result.indices, state.currentMaxRows, result.stride);
        notifyLinkedWidgets();
      }
    }
  });

  document.addEventListener("mouseup", () => {
    if (state.colResizeDrag.active) {
      state.colResizeDrag.active = false;
      document.querySelectorAll(`#${uid} .resize-handle-input, #${uid} .resize-handle`).forEach((h) => {
        h.classList.remove("dragging");
      });
    }
    if (state.yAxisDrag.active) state.yAxisDrag.active = false;
    if (state.xAxisDrag.active) state.xAxisDrag.active = false;
    if (state.plotMinLayerDrag.active) state.plotMinLayerDrag.active = false;
    if (state.rightEdgeDrag.active) {
      state.rightEdgeDrag.active = false;
      dom.resizeRight()?.classList.remove("dragging");
    }
  });

  // Bottom resize handle for row truncation
  const bottomHandle = dom.resizeBottom();
  if (bottomHandle) {
    let isDragging = false;
    let startY = 0;
    let startMaxRows: number | null = null;
    let measuredRowHeight = 20;

    bottomHandle.addEventListener("mousedown", (e) => {
      closePopup();
      isDragging = true;
      startY = e.clientY;
      startMaxRows = state.currentMaxRows;
      const table = dom.table();
      if (table) {
        const rows = table.querySelectorAll("tr");
        if (rows.length >= 2) {
          measuredRowHeight = rows[1].getBoundingClientRect().height;
        }
      }
      bottomHandle.classList.add("dragging");
      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const delta = e.clientY - startY;
      const rowDelta = Math.round(delta / measuredRowHeight);
      const totalTokens = data.tokens.length;
      const startRows = startMaxRows === null ? totalTokens : startMaxRows;
      let newMaxRows: number | null = startRows + rowDelta;
      newMaxRows = Math.max(1, Math.min(totalTokens, newMaxRows));
      if (newMaxRows >= totalTokens) newMaxRows = null;
      if (newMaxRows !== state.currentMaxRows) {
        buildTable(state.currentCellWidth, state.currentVisibleIndices, newMaxRows);
      }
    });

    document.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        bottomHandle.classList.remove("dragging");
      }
    });
  }

  // Right edge resize handle
  const rightHandle = dom.resizeRight();
  if (rightHandle) {
    rightHandle.addEventListener("mousedown", (e) => {
      closePopup();
      const table = dom.table();
      state.rightEdgeDrag = {
        active: true,
        startX: e.clientX,
        startTableWidth: table?.offsetWidth || 0,
        hadMaxTableWidth: state.maxTableWidth !== null,
        startMaxTableWidth: state.maxTableWidth,
      };
      rightHandle.classList.add("dragging");
      e.preventDefault();
      e.stopPropagation();
    });
  }

  // Widget global handlers
  dom.widget()?.addEventListener("mousedown", (e: Event) => {
    if ((e as MouseEvent).shiftKey) e.preventDefault();
  });

  dom.widget()?.addEventListener("mouseleave", () => {
    state.currentHoverPos = data.tokens.length - 1;
    const chartInnerWidth = updateChartDimensions();
    drawAllTrajectoriesWrapper(null, null, null, chartInnerWidth, state.currentHoverPos);
  });

  // ═══════════════════════════════════════════════════════════════
  // WIDGET LINKING
  // ═══════════════════════════════════════════════════════════════

  function getColumnState(): ColumnState {
    return {
      cellWidth: state.currentCellWidth,
      inputTokenWidth: state.inputTokenWidth,
      maxTableWidth: state.maxTableWidth,
    };
  }

  function setColumnState(colState: Partial<ColumnState>, fromSync = false): void {
    if (state.isSyncing) return;
    let changed = false;

    if (colState.cellWidth !== undefined && colState.cellWidth !== state.currentCellWidth) {
      state.currentCellWidth = colState.cellWidth;
      changed = true;
    }
    if (colState.inputTokenWidth !== undefined && colState.inputTokenWidth !== state.inputTokenWidth) {
      state.inputTokenWidth = colState.inputTokenWidth;
      changed = true;
    }
    if (colState.maxTableWidth !== undefined && colState.maxTableWidth !== state.maxTableWidth) {
      state.maxTableWidth = colState.maxTableWidth;
      changed = true;
    }

    if (changed) {
      const result = computeVisibleLayers(state.currentCellWidth, getContainerWidth());
      buildTable(state.currentCellWidth, result.indices, state.currentMaxRows, result.stride);
      if (!fromSync) {
        notifyLinkedWidgets();
      }
    }
  }

  function notifyLinkedWidgets(): void {
    if (state.isSyncing) return;
    state.isSyncing = true;
    const colState = getColumnState();
    for (const w of state.linkedWidgets) {
      if (w.setColumnState) {
        w.setColumnState(colState, true);
      }
    }
    state.isSyncing = false;
  }

  function getState(): UIState {
    return {
      chartHeight: state.chartHeight,
      inputTokenWidth: state.inputTokenWidth,
      cellWidth: state.currentCellWidth,
      maxRows: state.currentMaxRows,
      maxTableWidth: state.maxTableWidth,
      plotMinLayer: state.plotMinLayer,
      colorModes: state.colorModes.slice(),
      title: state.customTitle,
      colorIndex: state.colorIndex,
      pinnedGroups: JSON.parse(JSON.stringify(state.pinnedGroups)),
      lastPinnedGroupIndex: state.lastPinnedGroupIndex,
      pinnedRows: state.pinnedRows.map((pr) => ({
        pos: pr.pos,
        line: pr.lineStyle.name,
      })),
      heatmapBaseColor: state.heatmapBaseColor,
      heatmapNextColor: state.heatmapNextColor,
      darkMode: state.darkModeOverride,
      trajectoryMetric: trajectoryMetric,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // DARK MODE
  // ═══════════════════════════════════════════════════════════════

  function applyDarkMode(enabled: boolean): void {
    const widgetEl = dom.widget();
    if (widgetEl) {
      if (enabled) {
        widgetEl.classList.add("dark-mode");
        widgetEl.style.colorScheme = "dark";
      } else {
        widgetEl.classList.remove("dark-mode");
        widgetEl.style.colorScheme = "";
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════

  // If we auto-pinned the last row, also auto-pin the most prominent token
  // (matching the behavior of clicking the row to pin it)
  if (didAutoPinLastRow && state.pinnedGroups.length === 0) {
    const pos = nPositions - 1;
    const bestToken = findHighestProbToken(pos, 2, 0.05);
    if (bestToken && findGroupForToken(bestToken) < 0) {
      const newGroup: PinnedGroup = { color: getNextColor(), tokens: [bestToken] };
      state.pinnedGroups.push(newGroup);
      state.lastPinnedGroupIndex = state.pinnedGroups.length - 1;
    }
  }

  const containerWidth = getContainerWidth();
  const result = computeVisibleLayers(state.currentCellWidth, containerWidth);
  buildTable(state.currentCellWidth, result.indices, state.currentMaxRows, result.stride);

  const svg = dom.chart();
  if (svg) {
    svg.setAttribute("height", String(getActualChartHeight()));
  }

  applyDarkMode(isDarkMode());

  // Set up hint hover listeners (once, not on every rebuild)
  const hint = dom.resizeHint();
  if (hint) {
    hint.addEventListener("mouseenter", () => {
      const extra = hint.querySelector(".resize-hint-extra") as HTMLElement;
      if (extra) extra.style.display = "inline";
      dom.widget()?.classList.add("show-all-handles");
    });
    hint.addEventListener("mouseleave", () => {
      const extra = hint.querySelector(".resize-hint-extra") as HTMLElement;
      if (extra) extra.style.display = "none";
      dom.widget()?.classList.remove("show-all-handles");
    });
  }

  // Watch for style changes
  let lastDetectedDarkMode = isDarkMode();
  const styleObserver = new MutationObserver(() => {
    const widgetEl = dom.widget();
    if (!widgetEl) {
      styleObserver.disconnect();
      return;
    }

    if (state.darkModeOverride === null) {
      const currentDarkMode = isDarkMode();
      if (currentDarkMode !== lastDetectedDarkMode) {
        lastDetectedDarkMode = currentDarkMode;
        applyDarkMode(currentDarkMode);
        buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows, state.currentStride);
      }
    }
  });

  styleObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["style", "class"],
  });

  if (document.body) {
    styleObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC INTERFACE
  // ═══════════════════════════════════════════════════════════════

  const publicInterface: LogitLensWidgetInterface = {
    uid,
    getState,
    getColumnState,
    setColumnState,
    linkColumnsTo(otherWidget: LogitLensWidgetInterface): void {
      if (!state.linkedWidgets.includes(otherWidget)) {
        state.linkedWidgets.push(otherWidget);
      }
      const otherLinked = otherWidget._getLinkedWidgets ? otherWidget._getLinkedWidgets() : [];
      if (!otherLinked.includes(publicInterface)) {
        otherWidget.linkColumnsTo(publicInterface);
      }
      otherWidget.setColumnState(getColumnState(), true);
    },
    unlinkColumns(otherWidget: LogitLensWidgetInterface): void {
      const idx = state.linkedWidgets.indexOf(otherWidget);
      if (idx >= 0) {
        state.linkedWidgets.splice(idx, 1);
      }
    },
    _getLinkedWidgets(): LogitLensWidgetInterface[] {
      return state.linkedWidgets;
    },
    setDarkMode(enabled: boolean | null): void {
      state.darkModeOverride = enabled === null ? null : !!enabled;
      applyDarkMode(isDarkMode());
      buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows, state.currentStride);
    },
    getDarkMode(): boolean {
      return isDarkMode();
    },
    setFontSize(options: { title?: string; content?: string } | null): void {
      const widgetEl = dom.widget();
      if (!widgetEl) return;
      if (options === null || (!options.title && !options.content)) {
        widgetEl.style.removeProperty("--ll-title-size");
        widgetEl.style.removeProperty("--ll-content-size");
      } else {
        if (options.title) widgetEl.style.setProperty("--ll-title-size", options.title);
        if (options.content) widgetEl.style.setProperty("--ll-content-size", options.content);
      }
      buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows, state.currentStride);
    },
    getFontSize(): { title: string; content: string } {
      const widgetEl = dom.widget();
      if (!widgetEl) return { title: "14px", content: "14px" };
      const computedStyle = getComputedStyle(widgetEl);
      return {
        title: computedStyle.getPropertyValue("--ll-title-size").trim() || "14px",
        content: computedStyle.getPropertyValue("--ll-content-size").trim() || "14px",
      };
    },
    // Row and group manipulation
    togglePinnedRow(pos: number): boolean {
      const result = togglePinnedRow(pos);
      buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
      return result;
    },
    togglePinnedTrajectory(token: string, addToGroup = false): boolean {
      const result = togglePinnedTrajectory(token, addToGroup);
      buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
      return result;
    },
    getPinnedRows(): SerializedPinnedRow[] {
      return getSerializedPinnedRows();
    },
    getPinnedGroups(): PinnedGroup[] {
      return JSON.parse(JSON.stringify(state.pinnedGroups));
    },
    // Event system
    on,
    off,
    // Title management
    setTitle(title: string): void {
      state.customTitle = title;
      updateTitle();
    },
    getTitle(): string {
      return state.customTitle;
    },
    // Metric mode API for trajectories
    setTrajectoryMetric(metric: TrajectoryMetric): void {
      if (metric === "rank" && !hasRankData()) {
        console.warn("No rank data available; keeping current metric");
        return;
      }
      trajectoryMetric = metric;
      // Redraw chart with new metric
      buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows, state.currentStride);
    },
    getTrajectoryMetric(): TrajectoryMetric {
      return trajectoryMetric;
    },
    // Color mode API for heatmap
    setColorModes(modes: string[]): void {
      state.colorModes = modes.slice();
      buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows, state.currentStride);
    },
    getColorModes(): string[] {
      return state.colorModes.slice();
    },
    addColorMode(mode: string): void {
      if (!state.colorModes.includes(mode)) {
        state.colorModes.push(mode);
        buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows, state.currentStride);
      }
    },
    removeColorMode(mode: string): void {
      const idx = state.colorModes.indexOf(mode);
      if (idx !== -1) {
        state.colorModes.splice(idx, 1);
        buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows, state.currentStride);
      }
    },
    // Data availability checks
    hasRankData(): boolean {
      return hasRankData();
    },
    hasEntropyData(): boolean {
      return hasEntropyData();
    },
    // Visibility toggles
    setShowHeatmap(show: boolean): void {
      state.showHeatmap = show;
      updateVisibility();
    },
    getShowHeatmap(): boolean {
      return state.showHeatmap;
    },
    setShowChart(show: boolean): void {
      state.showChart = show;
      updateVisibility();
    },
    getShowChart(): boolean {
      return state.showChart;
    },
    // Hover API for external synchronization
    hoverRow(pos: number): void {
      if (pos < 0 || pos >= nPositions) return;
      state.currentHoverPos = pos;
      const chartInnerWidth = updateChartDimensions();
      const bestToken = findHighestProbToken(pos, 2, 0.05);
      if (bestToken && findGroupForToken(bestToken) < 0) {
        const traj = getTrajectoryForToken(bestToken, pos);
        drawAllTrajectoriesWrapper(traj, "#999", bestToken, chartInnerWidth, pos);
      } else {
        drawAllTrajectoriesWrapper(null, null, null, chartInnerWidth, pos);
      }
      // Add visual highlight to the row in the table
      const table = dom.table();
      if (table) {
        table.querySelectorAll("tr").forEach((row) => {
          row.classList.remove("external-hover");
        });
        const row = table.querySelector(`tr:has(.input-token[data-pos="${pos}"])`);
        if (row) {
          row.classList.add("external-hover");
        }
      }
    },
    clearHover(): void {
      state.currentHoverPos = nPositions - 1;
      const chartInnerWidth = updateChartDimensions();
      drawAllTrajectoriesWrapper(null, null, null, chartInnerWidth, state.currentHoverPos);
      // Remove visual highlight
      const table = dom.table();
      if (table) {
        table.querySelectorAll("tr.external-hover").forEach((row) => {
          row.classList.remove("external-hover");
        });
      }
    },
    getHoveredRow(): number {
      return state.currentHoverPos;
    },
  };

  return publicInterface;
}

// Export for module usage
export default LogitLensWidget;

// Make available globally for browser usage
if (typeof window !== "undefined") {
  (window as any).LogitLensWidget = LogitLensWidget;
}
