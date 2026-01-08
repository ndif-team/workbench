/**
 * Type definitions for LogitLensWidget
 */

// ═══════════════════════════════════════════════════════════════
// DATA TYPES
// ═══════════════════════════════════════════════════════════════

/** Top-k prediction item */
export interface TopkItem {
  token: string;
  prob: number;
  trajectory: number[];
}

/** Cell data in internal format */
export interface CellData {
  token: string;
  prob: number;
  trajectory: number[];
  topk: TopkItem[];
}

/** Internal normalized data format (v1) */
export interface NormalizedData {
  layers: number[];
  tokens: string[];
  cells: CellData[][];
  meta: {
    model?: string;
    version?: number;
  };
}

/** Tracked trajectory data for a token */
export interface TrackedTrajectory {
  prob: number[];      // probability trajectory
  rank?: number[];     // rank trajectory (optional)
}

/** V2 compact input format */
export interface V2InputData {
  meta?: { model?: string; version?: number };
  input: string[];
  layers: number[];
  topk: string[][][]; // [layer][position][k]
  tracked: Record<string, number[] | TrackedTrajectory>[]; // [position]{token: trajectory or TrackedTrajectory}
  entropy?: number[][]; // [layer][position] - entropy at each position/layer (optional)
}

/** V1 input format (already has cells) */
export interface V1InputData {
  layers: number[];
  tokens?: string[];
  input?: string[];
  cells: CellData[][];
  meta?: { model?: string; version?: number };
}

/** Union of possible input formats */
export type WidgetInputData = V1InputData | V2InputData;

// ═══════════════════════════════════════════════════════════════
// METRIC MODES
// ═══════════════════════════════════════════════════════════════

/** Metric mode for trajectory chart Y-axis */
export type TrajectoryMetric = "probability" | "rank";

/**
 * Color mode for heatmap can be:
 * - "top": probability of top-k predictions (default purple)
 * - "entropy": entropy values at each position/layer
 * - "none": no coloring
 * - <token>: probability trajectory of a specific token
 *
 * The existing colorModes array supports these values.
 * Entropy is a special mode that requires entropy data in the input.
 */
export const ENTROPY_COLOR_MODE = "entropy";

// ═══════════════════════════════════════════════════════════════
// LINE STYLES
// ═══════════════════════════════════════════════════════════════

export interface LineStyle {
  name: string;
  dash: string;
}

export const LINE_STYLES: LineStyle[] = [
  { dash: "", name: "solid" },
  { dash: "8,4", name: "dashed" },
  { dash: "2,3", name: "dotted" },
  { dash: "8,4,2,4", name: "dash-dot" },
];

// ═══════════════════════════════════════════════════════════════
// PINNED ITEMS
// ═══════════════════════════════════════════════════════════════

/** Pinned trajectory group */
export interface PinnedGroup {
  tokens: string[];
  color: string;
  lineStyle?: LineStyle;
}

/** Pinned row */
export interface PinnedRow {
  pos: number;
  lineStyle: LineStyle;
}

/** Serialized pinned row (for state persistence) */
export interface SerializedPinnedRow {
  pos: number;
  line: string;
}

// ═══════════════════════════════════════════════════════════════
// UI STATE
// ═══════════════════════════════════════════════════════════════

/** UI state that can be serialized and restored */
export interface UIState {
  chartHeight?: number | null;
  inputTokenWidth?: number;
  cellWidth?: number;
  maxRows?: number | null;
  maxTableWidth?: number | null;
  plotMinLayer?: number;
  colorModes?: string[]; // includes "top", "entropy", specific tokens, etc.
  colorMode?: string; // legacy
  title?: string;
  colorIndex?: number;
  pinnedGroups?: PinnedGroup[];
  lastPinnedGroupIndex?: number;
  pinnedRows?: SerializedPinnedRow[];
  heatmapBaseColor?: string | null;
  heatmapNextColor?: string | null;
  darkMode?: boolean | null;
  trajectoryMetric?: TrajectoryMetric; // probability or rank for trajectory chart
  showHeatmap?: boolean;
  showChart?: boolean;
}

/** Column state for widget linking */
export interface ColumnState {
  cellWidth: number;
  inputTokenWidth: number;
  maxTableWidth: number | null;
}

// ═══════════════════════════════════════════════════════════════
// INTERNAL STATE
// ═══════════════════════════════════════════════════════════════

/** Drag state for column resizing */
export interface ColResizeDrag {
  active: boolean;
  type: "cell" | "input" | null;
  startX: number;
  startWidth: number;
  colIdx: number;
}

/** Drag state for y-axis resizing */
export interface YAxisDrag {
  active: boolean;
  startX: number;
  startWidth: number;
}

/** Drag state for x-axis (chart height) resizing */
export interface XAxisDrag {
  active: boolean;
  startY: number;
  startHeight: number;
}

/** Drag state for plot min layer adjustment */
export interface PlotMinLayerDrag {
  active: boolean;
  startX: number;
  startMinLayer: number;
  layerIdx: number;
  layerXAtStart: number;
  usableWidth: number;
  dotRadius: number;
}

/** Drag state for right edge (table width) */
export interface RightEdgeDrag {
  active: boolean;
  startX: number;
  startTableWidth: number;
  hadMaxTableWidth: boolean;
  startMaxTableWidth: number | null;
}

/** Complete internal widget state */
export interface WidgetState {
  // Layout dimensions
  chartHeight: number | null;
  inputTokenWidth: number;
  currentCellWidth: number;
  currentMaxRows: number | null;
  maxTableWidth: number | null;
  plotMinLayer: number;

  // Computed layout
  currentVisibleIndices: number[];
  currentStride: number;

  // Interaction state
  openPopupCell: { pos: number; li: number } | null;
  currentHoverPos: number;
  colorPickerTarget: string | null;

  // Pinned trajectories
  pinnedGroups: PinnedGroup[];
  pinnedRows: PinnedRow[];
  lastPinnedGroupIndex: number;

  // Color settings
  colorModes: string[];
  colorIndex: number;
  heatmapBaseColor: string | null;
  heatmapNextColor: string | null;

  // Display settings
  customTitle: string;
  darkModeOverride: boolean | null;
  showHeatmap: boolean;
  showChart: boolean;

  // Widget linking
  linkedWidgets: LogitLensWidgetInterface[];
  isSyncing: boolean;

  // Drag interaction state
  colResizeDrag: ColResizeDrag;
  yAxisDrag: YAxisDrag;
  xAxisDrag: XAxisDrag;
  plotMinLayerDrag: PlotMinLayerDrag;
  rightEdgeDrag: RightEdgeDrag;
}

// ═══════════════════════════════════════════════════════════════
// EVENT SYSTEM
// ═══════════════════════════════════════════════════════════════

/**
 * Widget events and their value types.
 * Use widget.on(eventName, listener) to subscribe.
 * Use widget.off(eventName, listener) to unsubscribe.
 */
export interface WidgetEvents {
  // Layout
  chartHeight: number | null;
  inputTokenWidth: number;
  cellWidth: number;
  maxRows: number | null;
  maxTableWidth: number | null;

  // Chart
  plotMinLayer: number;
  colorModes: string[];
  colorIndex: number;
  heatmapBaseColor: string | null;
  heatmapNextColor: string | null;
  trajectoryMetric: TrajectoryMetric;

  // Pinning
  pinnedRows: SerializedPinnedRow[];
  pinnedGroups: PinnedGroup[];

  // Display
  title: string;
  darkMode: boolean | null;
  showHeatmap: boolean;
  showChart: boolean;

  // Transient (not persisted in UIState)
  hover: number | null;
}

/** Event listener function type */
export type WidgetEventListener<K extends keyof WidgetEvents> = (
  value: WidgetEvents[K]
) => void;

/** Generic listener for internal use */
export type AnyWidgetEventListener = (value: unknown) => void;

// ═══════════════════════════════════════════════════════════════
// PUBLIC INTERFACE
// ═══════════════════════════════════════════════════════════════

/** Public interface returned by LogitLensWidget */
export interface LogitLensWidgetInterface {
  uid: string;
  getState(): UIState;
  getColumnState(): ColumnState;
  setColumnState(colState: Partial<ColumnState>, fromSync?: boolean): void;
  linkColumnsTo(otherWidget: LogitLensWidgetInterface): void;
  unlinkColumns(otherWidget: LogitLensWidgetInterface): void;
  _getLinkedWidgets(): LogitLensWidgetInterface[];
  setDarkMode(enabled: boolean | null): void;
  getDarkMode(): boolean;
  setFontSize(options: { title?: string; content?: string } | null): void;
  getFontSize(): { title: string; content: string };
  // Row and group manipulation
  togglePinnedRow(pos: number): boolean;
  togglePinnedTrajectory(token: string, addToGroup?: boolean): boolean;
  getPinnedRows(): SerializedPinnedRow[];
  getPinnedGroups(): PinnedGroup[];
  // Event system
  on<K extends keyof WidgetEvents>(
    event: K,
    listener: WidgetEventListener<K>
  ): void;
  off<K extends keyof WidgetEvents>(
    event: K,
    listener: WidgetEventListener<K>
  ): void;
  // Title management
  setTitle(title: string): void;
  getTitle(): string;
  // Metric mode API for trajectories
  setTrajectoryMetric(metric: TrajectoryMetric): void;
  getTrajectoryMetric(): TrajectoryMetric;
  // Color mode API for heatmap (existing colorModes includes "top", "entropy", specific tokens)
  setColorModes(modes: string[]): void;
  getColorModes(): string[];
  addColorMode(mode: string): void;
  removeColorMode(mode: string): void;
  // Data availability checks
  hasRankData(): boolean;
  hasEntropyData(): boolean;
  // Visibility toggles
  setShowHeatmap(show: boolean): void;
  getShowHeatmap(): boolean;
  setShowChart(show: boolean): void;
  getShowChart(): boolean;
  // Hover API for external synchronization
  hoverRow(pos: number): void;
  clearHover(): void;
  getHoveredRow(): number;
}

// ═══════════════════════════════════════════════════════════════
// DOM HELPERS TYPE
// ═══════════════════════════════════════════════════════════════

export interface DOMHelpers {
  widget(): HTMLElement | null;
  table(): HTMLTableElement | null;
  chart(): SVGElement | null;
  popup(): HTMLElement | null;
  popupClose(): HTMLElement | null;
  popupLayer(): HTMLElement | null;
  popupPos(): HTMLElement | null;
  popupContent(): HTMLElement | null;
  colorMenu(): HTMLElement | null;
  colorBtn(): HTMLElement | null;
  colorPicker(): HTMLInputElement | null;
  title(): HTMLElement | null;
  titleText(): HTMLElement | null;
  overlay(): HTMLElement | null;
  resizeHint(): HTMLElement | null;
  resizeBottom(): HTMLElement | null;
  resizeRight(): HTMLElement | null;
  chartContainer(): HTMLElement | null;
  tableWrapper(): HTMLElement | null;
}

// ═══════════════════════════════════════════════════════════════
// CHART MARGIN TYPE
// ═══════════════════════════════════════════════════════════════

export interface ChartMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

export const COLORS = [
  "#2196F3",
  "#e91e63",
  "#4CAF50",
  "#FF9800",
  "#9C27B0",
  "#00BCD4",
  "#F44336",
  "#8BC34A",
];

export const MIN_CHART_HEIGHT = 60;
export const MAX_CHART_HEIGHT = 400;
export const MIN_CELL_WIDTH = 10;
export const MAX_CELL_WIDTH = 200;
export const DEFAULT_BASE_COLOR = "#8844ff"; // purple for "top"
export const DEFAULT_NEXT_COLOR = "#cc6622"; // burnt orange for specific token
