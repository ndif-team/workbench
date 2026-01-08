/**
 * Chart rendering for LogitLensWidget
 */

import type {
  NormalizedData,
  WidgetState,
  DOMHelpers,
  PinnedGroup,
  ChartMargin,
  TrajectoryMetric,
  WidgetEvents,
  SerializedPinnedRow,
} from "./types";
import { LINE_STYLES } from "./types";
import {
  niceMax,
  formatPct,
  visualizeSpaces,
  getContentFontSizePx,
  getChartMargin,
  getDefaultChartHeight,
} from "./utils";

export interface ChartContext {
  uid: string;
  data: NormalizedData;
  state: WidgetState;
  dom: DOMHelpers;
  isDarkMode: () => boolean;
  getActualChartHeight: () => number;
  getGroupTrajectory: (group: PinnedGroup, pos: number) => number[] | null;
  getGroupLabel: (group: PinnedGroup) => string;
  getLineStyleForRow: (pos: number) => { name: string; dash: string };
  getTrajectoryMetric: () => TrajectoryMetric;
  closePopup: () => void;
  emit: <K extends keyof WidgetEvents>(event: K, value: WidgetEvents[K]) => void;
  getSerializedPinnedRows: () => SerializedPinnedRow[];
  buildTable: (
    cellWidth: number,
    visibleLayerIndices: number[],
    maxRows: number | null,
    stride?: number
  ) => void;
}

/**
 * Draw all trajectories on the chart
 */
export function drawAllTrajectories(
  ctx: ChartContext,
  hoverTrajectory: number[] | null,
  hoverColor: string | null,
  hoverLabel: string | null,
  chartInnerWidth: number,
  pos: number
): void {
  const { uid, data, state, dom, isDarkMode, getActualChartHeight } = ctx;
  const nLayers = data.layers.length;

  const svg = dom.chart();
  if (!svg) return;
  svg.innerHTML = "";

  const table = dom.table();
  if (!table) return;

  const firstInputCell = table.querySelector(".input-token");
  const tableRect = table.getBoundingClientRect();
  const inputCellRect = firstInputCell?.getBoundingClientRect();
  const actualInputRight = inputCellRect
    ? inputCellRect.right - tableRect.left
    : state.inputTokenWidth;

  // Create legend group (will be appended after chart content for proper z-order)
  const legendG = document.createElementNS("http://www.w3.org/2000/svg", "g");
  legendG.setAttribute("class", "legend-area");

  const chartMargin = getChartMargin(dom);
  const chartHeight = getActualChartHeight();
  const chartInnerHeight = chartHeight - chartMargin.top - chartMargin.bottom;

  // Main chart group
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute(
    "transform",
    `translate(${actualInputRight},${chartMargin.top})`
  );
  svg.appendChild(g);

  // Font scale for sizing
  const fontScale = getContentFontSizePx(dom) / 10;
  const dotRadius = 3 * fontScale;
  const strokeWidth = 2 * fontScale;
  const strokeWidthHover = 1.5 * fontScale;
  const labelMargin = chartMargin.right;
  const usableWidth = chartInnerWidth - labelMargin;

  // X-axis scaling
  function layerToX(layerIdx: number): number {
    if (nLayers <= 1) return usableWidth / 2;
    const visibleLayerRange = nLayers - 1 - state.plotMinLayer;
    if (visibleLayerRange <= 0) return usableWidth / 2;
    return (
      dotRadius +
      ((layerIdx - state.plotMinLayer) / visibleLayerRange) *
        (usableWidth - 2 * dotRadius)
    );
  }

  // Create X-axis with drag handler
  const xAxisGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  xAxisGroup.style.cursor = "row-resize";

  const xAxisHoverBg = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect"
  );
  xAxisHoverBg.setAttribute("x", "0");
  xAxisHoverBg.setAttribute("y", String(chartInnerHeight - 2));
  xAxisHoverBg.setAttribute("width", String(chartInnerWidth));
  xAxisHoverBg.setAttribute("height", "4");
  xAxisHoverBg.setAttribute("fill", "rgba(33, 150, 243, 0.3)");
  xAxisHoverBg.style.display = "none";
  xAxisGroup.appendChild(xAxisHoverBg);

  const xAxisHitTarget = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect"
  );
  xAxisHitTarget.setAttribute("x", "0");
  xAxisHitTarget.setAttribute("y", String(chartInnerHeight - 4));
  xAxisHitTarget.setAttribute("width", String(chartInnerWidth));
  xAxisHitTarget.setAttribute("height", "8");
  xAxisHitTarget.setAttribute("fill", "transparent");
  xAxisGroup.appendChild(xAxisHitTarget);

  const xAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
  xAxis.setAttribute("x1", "0");
  xAxis.setAttribute("y1", String(chartInnerHeight));
  xAxis.setAttribute("x2", String(chartInnerWidth));
  xAxis.setAttribute("y2", String(chartInnerHeight));
  xAxis.setAttribute("stroke", "#ccc");
  xAxisGroup.appendChild(xAxis);
  g.appendChild(xAxisGroup);

  xAxisGroup.addEventListener("mouseenter", () => {
    xAxisHoverBg.style.display = "block";
  });
  xAxisGroup.addEventListener("mouseleave", () => {
    xAxisHoverBg.style.display = "none";
  });
  xAxisGroup.addEventListener("mousedown", (e) => {
    ctx.closePopup();
    state.xAxisDrag = {
      active: true,
      startY: e.clientY,
      startHeight: getActualChartHeight(),
    };
    xAxis.setAttribute("stroke", "rgba(33, 150, 243, 0.6)");
    e.preventDefault();
    e.stopPropagation();
  });

  // Create clip paths
  const clipFontSize = getContentFontSizePx(dom);
  const clipLeftExtent = 10 + clipFontSize * 5;
  const clipTopExtent = clipFontSize * 1.2;

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");

  // Main chart clip
  const clipId = `${uid}_chart_clip`;
  const clipPath = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "clipPath"
  );
  clipPath.setAttribute("id", clipId);
  const clipRect = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect"
  );
  clipRect.setAttribute("x", String(-clipLeftExtent));
  clipRect.setAttribute("y", String(-clipTopExtent));
  clipRect.setAttribute("width", String(chartInnerWidth + clipLeftExtent));
  clipRect.setAttribute(
    "height",
    String(chartInnerHeight + clipTopExtent + chartMargin.bottom + clipFontSize * 0.5)
  );
  clipPath.appendChild(clipRect);
  defs.appendChild(clipPath);

  // Trajectory clip (clips at x=0)
  const trajClipId = `${uid}_traj_clip`;
  const trajClipPath = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "clipPath"
  );
  trajClipPath.setAttribute("id", trajClipId);
  const trajClipRect = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect"
  );
  trajClipRect.setAttribute("x", "0");
  trajClipRect.setAttribute("y", String(-clipTopExtent));
  trajClipRect.setAttribute("width", String(chartInnerWidth));
  trajClipRect.setAttribute("height", String(chartInnerHeight + clipTopExtent + 10));
  trajClipPath.appendChild(trajClipRect);
  defs.appendChild(trajClipPath);

  svg.appendChild(defs);
  g.setAttribute("clip-path", `url(#${clipId})`);

  // Create trajectory group
  const trajG = document.createElementNS("http://www.w3.org/2000/svg", "g");
  trajG.setAttribute("clip-path", `url(#${trajClipId})`);
  g.appendChild(trajG);

  // X-axis tick labels
  const minTickGap = 24;
  let labelStride = 1;
  if (state.currentVisibleIndices.length >= 2) {
    const firstX = layerToX(state.currentVisibleIndices[0]);
    const secondX = layerToX(state.currentVisibleIndices[1]);
    const pixelsPerIndex = Math.abs(secondX - firstX);
    if (pixelsPerIndex >= 1 && pixelsPerIndex < minTickGap) {
      labelStride = Math.ceil(minTickGap / pixelsPerIndex);
    }
  }

  const lastIdx = state.currentVisibleIndices.length - 1;
  const showAtIndex = new Set<number>();
  for (let i = lastIdx; i >= 0; i -= labelStride) {
    showAtIndex.add(i);
  }
  showAtIndex.add(0);

  const minXForLabel = 8;
  state.currentVisibleIndices.forEach((layerIdx, i) => {
    if (showAtIndex.has(i)) {
      const x = layerToX(layerIdx);
      if (state.plotMinLayer > 0 && x < minXForLabel) return;

      const isLast = i === lastIdx;
      const isDraggable = !isLast && layerIdx > 0;

      const tickGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");

      if (isDraggable) {
        const fontSize = getContentFontSizePx(dom);
        const hoverBg = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "rect"
        );
        const bgWidth = Math.max(16, fontSize * 1.6);
        const bgHeight = fontSize + 2;
        hoverBg.setAttribute("x", String(x - bgWidth / 2));
        hoverBg.setAttribute("y", String(chartInnerHeight + 2));
        hoverBg.setAttribute("width", String(bgWidth));
        hoverBg.setAttribute("height", String(bgHeight));
        hoverBg.setAttribute("rx", "2");
        hoverBg.setAttribute("fill", "rgba(33, 150, 243, 0.3)");
        hoverBg.style.display = "none";
        hoverBg.classList.add("tick-hover-bg");
        tickGroup.appendChild(hoverBg);
      }

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", String(x));
      label.setAttribute("y", String(chartInnerHeight + 2 + getContentFontSizePx(dom)));
      label.setAttribute("text-anchor", "middle");
      label.style.fontSize = "var(--ll-content-size, 14px)";
      label.setAttribute("fill", isDarkMode() ? "#aaa" : "#666");
      label.textContent = String(data.layers[layerIdx]);
      tickGroup.appendChild(label);

      if (isDraggable) {
        tickGroup.style.cursor = "col-resize";
        tickGroup.setAttribute("data-layer-idx", String(layerIdx));

        tickGroup.addEventListener("mouseenter", () => {
          const bg = tickGroup.querySelector(".tick-hover-bg") as SVGElement;
          if (bg) bg.style.display = "block";
        });
        tickGroup.addEventListener("mouseleave", () => {
          const bg = tickGroup.querySelector(".tick-hover-bg") as SVGElement;
          if (bg) bg.style.display = "none";
        });
        tickGroup.addEventListener("mousedown", (e) => {
          ctx.closePopup();
          state.plotMinLayerDrag = {
            active: true,
            startX: e.clientX,
            startMinLayer: state.plotMinLayer,
            layerIdx,
            layerXAtStart: layerToX(layerIdx),
            usableWidth,
            dotRadius,
          };
          e.preventDefault();
          e.stopPropagation();
        });
      }

      g.appendChild(tickGroup);
    }
  });

  // Y-axis with drag handler
  const yAxisGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  yAxisGroup.style.cursor = "col-resize";

  const yAxisHoverBg = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect"
  );
  yAxisHoverBg.setAttribute("x", "-2");
  yAxisHoverBg.setAttribute("y", "0");
  yAxisHoverBg.setAttribute("width", "4");
  yAxisHoverBg.setAttribute("height", String(chartInnerHeight));
  yAxisHoverBg.setAttribute("fill", "rgba(33, 150, 243, 0.3)");
  yAxisHoverBg.style.display = "none";
  yAxisGroup.appendChild(yAxisHoverBg);

  const yAxisHitTarget = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect"
  );
  yAxisHitTarget.setAttribute("x", "-4");
  yAxisHitTarget.setAttribute("y", "0");
  yAxisHitTarget.setAttribute("width", "8");
  yAxisHitTarget.setAttribute("height", String(chartInnerHeight));
  yAxisHitTarget.setAttribute("fill", "transparent");
  yAxisGroup.appendChild(yAxisHitTarget);

  const yAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
  yAxis.setAttribute("x1", "0");
  yAxis.setAttribute("y1", "0");
  yAxis.setAttribute("x2", "0");
  yAxis.setAttribute("y2", String(chartInnerHeight));
  yAxis.setAttribute("stroke", "#ccc");
  yAxisGroup.appendChild(yAxis);
  g.appendChild(yAxisGroup);

  yAxisGroup.addEventListener("mouseenter", () => {
    yAxisHoverBg.style.display = "block";
  });
  yAxisGroup.addEventListener("mouseleave", () => {
    yAxisHoverBg.style.display = "none";
  });
  yAxisGroup.addEventListener("mousedown", (e) => {
    ctx.closePopup();
    state.yAxisDrag = {
      active: true,
      startX: e.clientX,
      startWidth: state.inputTokenWidth,
    };
    yAxis.setAttribute("stroke", "rgba(33, 150, 243, 0.6)");
    e.preventDefault();
    e.stopPropagation();
  });

  // Y-axis label
  const metric = ctx.getTrajectoryMetric();
  const yLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
  yLabel.setAttribute("x", String(-chartInnerHeight / 2));
  yLabel.setAttribute("y", String(-actualInputRight + 15));
  yLabel.setAttribute("text-anchor", "middle");
  yLabel.style.fontSize = "var(--ll-content-size, 14px)";
  yLabel.setAttribute("fill", "#666");
  yLabel.setAttribute("transform", "rotate(-90)");
  yLabel.textContent = metric === "rank" ? "Rank" : "Probability";
  svg.appendChild(yLabel);

  // Determine positions to show
  const positionsToShow: number[] = [];
  if (state.pinnedRows.length > 0) {
    state.pinnedRows.forEach((pr) => positionsToShow.push(pr.pos));
  } else {
    positionsToShow.push(pos);
  }

  // Calculate max value for scale (probability or rank)
  let allValues: number[] = [];
  positionsToShow.forEach((showPos) => {
    state.pinnedGroups.forEach((group) => {
      const traj = ctx.getGroupTrajectory(group, showPos);
      if (traj) {
        allValues = allValues.concat(traj);
      }
    });
  });
  if (hoverTrajectory) allValues = allValues.concat(hoverTrajectory);

  // For rank mode, use max rank; for probability mode, use niceMax
  let maxValue: number;
  let tickLabelText: string;
  const isRankMode = metric === "rank";
  if (isRankMode) {
    // For rank, find max and round up to nice value
    const rawMax = Math.max(...allValues, 1);
    maxValue = rawMax <= 10 ? 10 : rawMax <= 100 ? 100 : rawMax <= 1000 ? 1000 : Math.ceil(rawMax / 1000) * 1000;
    tickLabelText = String(Math.round(maxValue));
  } else {
    const rawMaxProb = Math.max(...allValues, 0.001);
    maxValue = niceMax(rawMaxProb);
    tickLabelText = formatPct(maxValue);
  }

  // Y-axis tick at top (for probability) or bottom (for rank since lower is better)
  const hasData =
    state.pinnedGroups.length > 0 || (hoverTrajectory && hoverLabel);
  if (hasData) {
    // For rank mode, show max rank at bottom (inverted scale)
    const tickY = isRankMode ? chartInnerHeight : 0;
    const tickLine = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line"
    );
    tickLine.setAttribute("x1", "-3");
    tickLine.setAttribute("y1", String(tickY));
    tickLine.setAttribute("x2", "3");
    tickLine.setAttribute("y2", String(tickY));
    tickLine.setAttribute("stroke", "#999");
    g.appendChild(tickLine);

    const tickFontSize = getContentFontSizePx(dom) * 0.9;
    const tickLabel = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text"
    );
    tickLabel.setAttribute("x", "-5");
    tickLabel.setAttribute("y", String(tickY + tickFontSize * 0.35));
    tickLabel.setAttribute("text-anchor", "end");
    tickLabel.style.fontSize = "calc(var(--ll-content-size, 14px) * 0.9)";
    tickLabel.setAttribute("fill", isDarkMode() ? "#aaa" : "#666");
    tickLabel.textContent = tickLabelText;
    g.appendChild(tickLabel);

    // For rank mode, also show "1" at top
    if (isRankMode) {
      const topTickY = 0;
      const topTickLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      topTickLine.setAttribute("x1", "-3");
      topTickLine.setAttribute("y1", String(topTickY));
      topTickLine.setAttribute("x2", "3");
      topTickLine.setAttribute("y2", String(topTickY));
      topTickLine.setAttribute("stroke", "#999");
      g.appendChild(topTickLine);

      const topTickLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
      topTickLabel.setAttribute("x", "-5");
      topTickLabel.setAttribute("y", String(topTickY + tickFontSize * 0.35));
      topTickLabel.setAttribute("text-anchor", "end");
      topTickLabel.style.fontSize = "calc(var(--ll-content-size, 14px) * 0.9)";
      topTickLabel.setAttribute("fill", isDarkMode() ? "#aaa" : "#666");
      topTickLabel.textContent = "1";
      g.appendChild(topTickLabel);
    }
  }

  // Legend setup
  let legendEntryCount = 0;
  if (state.pinnedRows.length > 1 && state.pinnedGroups.length === 1) {
    legendEntryCount = 1 + state.pinnedRows.length;
  } else {
    legendEntryCount = state.pinnedGroups.length;
  }
  if (hoverTrajectory && hoverLabel) {
    legendEntryCount += 1;
  }

  const legendEntryHeight = 14 * fontScale;
  const legendLineLength = 20 * fontScale;
  const legendTextX = 25 * fontScale;
  const legendTextY = 4 * fontScale;
  const legendCloseX = -12 * fontScale;
  const legendIndent = 18 * fontScale;
  const legendTotalHeight = legendEntryCount * legendEntryHeight;
  const legendStartY =
    chartMargin.top +
    Math.max(10 * fontScale, (chartInnerHeight - legendTotalHeight) / 2);
  let legendY = legendStartY;

  // Determine if we're in multi-row mode (single group, multiple rows)
  const isMultiRowMode = state.pinnedRows.length > 1 && state.pinnedGroups.length === 1;

  // Estimate legend width to determine if it protrudes into chart area
  const legendLabels: string[] = [];
  let legendRightEdge: number;

  if (isMultiRowMode) {
    // In multi-row mode: group header (just text) + row entries (line + text)
    const groupLabel = ctx.getGroupLabel(state.pinnedGroups[0]);
    const rowLabels: string[] = [];
    state.pinnedRows.forEach((row) => {
      const token = data.tokens[row.pos] || `pos ${row.pos}`;
      rowLabels.push(visualizeSpaces(token));
    });

    // Group header width (outdented by 5*fontScale, no line)
    const groupLabelWidth = groupLabel.length * 7 * fontScale;
    const groupRightEdge = (legendIndent - 5 * fontScale) + groupLabelWidth;

    // Row entries width (line 15*fontScale + gap 5*fontScale + text)
    const maxRowLabelLength = Math.max(...rowLabels.map((l) => l.length), 0);
    const rowTextWidth = maxRowLabelLength * 7 * fontScale;
    const rowRightEdge = legendIndent + 20 * fontScale + rowTextWidth;

    legendRightEdge = Math.max(groupRightEdge, rowRightEdge);
    legendLabels.push(groupLabel, ...rowLabels);
  } else {
    state.pinnedGroups.forEach((group) => {
      legendLabels.push(ctx.getGroupLabel(group));
    });
    const maxLabelLength = Math.max(...legendLabels.map((l) => l.length), 0);
    const estimatedTextWidth = maxLabelLength * 7 * fontScale;
    legendRightEdge = legendIndent + 20 * fontScale + estimatedTextWidth;
  }

  if (hoverLabel) {
    legendLabels.push(visualizeSpaces(hoverLabel));
    const hoverTextWidth = visualizeSpaces(hoverLabel).length * 7 * fontScale;
    const hoverRightEdge = legendIndent + 20 * fontScale + hoverTextWidth;
    legendRightEdge = Math.max(legendRightEdge, hoverRightEdge);
  }

  const legendProtrudesIntoChart = legendRightEdge > actualInputRight && legendEntryCount > 0;

  // Add opaque background if legend protrudes into chart area
  if (legendProtrudesIntoChart) {
    const bgPadding = 3 * fontScale;
    const closeButtonSpace = 15;
    // For multi-row mode, group header is outdented
    const legendLeftEdge = isMultiRowMode
      ? (legendIndent - 5 * fontScale - bgPadding - closeButtonSpace)
      : (legendIndent - bgPadding - closeButtonSpace);
    const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bgRect.setAttribute("x", String(legendLeftEdge));
    bgRect.setAttribute("y", String(legendStartY - legendEntryHeight / 2 - bgPadding));
    bgRect.setAttribute("width", String(legendRightEdge - legendLeftEdge + bgPadding));
    bgRect.setAttribute("height", String(legendTotalHeight + bgPadding * 2));
    bgRect.setAttribute("rx", String(4 * fontScale));
    bgRect.setAttribute("fill", isDarkMode() ? "#252525" : "#fafafa");
    bgRect.setAttribute("stroke", isDarkMode() ? "#444" : "#ddd");
    bgRect.setAttribute("stroke-width", "1");
    legendG.appendChild(bgRect);
  }

  // Draw trajectories (skip if trajectory data is missing)
  positionsToShow.forEach((showPos) => {
    const lineStyle = ctx.getLineStyleForRow(showPos);
    state.pinnedGroups.forEach((group) => {
      const traj = ctx.getGroupTrajectory(group, showPos);
      if (!traj) return; // Skip if no trajectory data available
      const groupLabel = ctx.getGroupLabel(group);
      drawSingleTrajectory(
        trajG,
        traj,
        group.color,
        maxValue,
        groupLabel,
        false,
        chartInnerWidth,
        lineStyle.dash,
        state,
        data,
        dom,
        layerToX,
        chartInnerHeight,
        fontScale,
        isRankMode
      );
    });
  });

  // Draw legend entries
  if (isMultiRowMode) {
    // Multi-row mode: show group header (token name in color, outdented), then each row with its line style
    const group = state.pinnedGroups[0];
    const groupLabel = ctx.getGroupLabel(group);
    const rowIndent = legendIndent + 10 * fontScale; // Row entries indented more than group header

    // Group header entry (no line, just colored text, outdented)
    const groupItem = document.createElementNS("http://www.w3.org/2000/svg", "g");
    groupItem.setAttribute("transform", `translate(${legendIndent - 5 * fontScale}, ${legendY})`);
    groupItem.style.cursor = "pointer";

    const groupHitTarget = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    groupHitTarget.setAttribute("x", "-15");
    groupHitTarget.setAttribute("y", "-8");
    groupHitTarget.setAttribute("width", String(state.inputTokenWidth - 5));
    groupHitTarget.setAttribute("height", "14");
    groupHitTarget.setAttribute("fill", "transparent");
    groupItem.appendChild(groupHitTarget);

    const groupCloseBtn = document.createElementNS("http://www.w3.org/2000/svg", "text");
    groupCloseBtn.setAttribute("class", "legend-close");
    groupCloseBtn.setAttribute("x", String(legendCloseX));
    groupCloseBtn.setAttribute("y", "0");
    groupCloseBtn.setAttribute("dominant-baseline", "middle");
    groupCloseBtn.style.fontSize = "var(--ll-content-size, 14px)";
    groupCloseBtn.setAttribute("fill", "#999");
    groupCloseBtn.style.display = "none";
    groupCloseBtn.textContent = "\u00d7";
    groupItem.appendChild(groupCloseBtn);

    // No line for group header, just colored text
    const groupText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    groupText.setAttribute("x", "0");
    groupText.setAttribute("y", String(legendTextY));
    groupText.style.fontSize = "var(--ll-content-size, 14px)";
    groupText.setAttribute("fill", group.color);
    groupText.style.fontWeight = "500";
    groupText.textContent = groupLabel;
    groupItem.appendChild(groupText);

    groupItem.addEventListener("mouseenter", () => { groupCloseBtn.style.display = "block"; });
    groupItem.addEventListener("mouseleave", () => { groupCloseBtn.style.display = "none"; });
    groupCloseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.pinnedGroups.splice(0, 1);
      state.lastPinnedGroupIndex = -1;
      ctx.buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
    });

    legendG.appendChild(groupItem);
    legendY += legendEntryHeight;

    // Row entries with line styles (no text prefix, just line + token)
    state.pinnedRows.forEach((row, rowIdx) => {
      const token = data.tokens[row.pos] || `pos ${row.pos}`;
      const rowLabel = visualizeSpaces(token);

      const rowItem = document.createElementNS("http://www.w3.org/2000/svg", "g");
      rowItem.setAttribute("transform", `translate(${legendIndent}, ${legendY})`);
      rowItem.style.cursor = "pointer";

      const rowHitTarget = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rowHitTarget.setAttribute("x", "-15");
      rowHitTarget.setAttribute("y", "-8");
      rowHitTarget.setAttribute("width", String(state.inputTokenWidth - 5));
      rowHitTarget.setAttribute("height", "14");
      rowHitTarget.setAttribute("fill", "transparent");
      rowItem.appendChild(rowHitTarget);

      const rowCloseBtn = document.createElementNS("http://www.w3.org/2000/svg", "text");
      rowCloseBtn.setAttribute("class", "legend-close");
      rowCloseBtn.setAttribute("x", String(legendCloseX));
      rowCloseBtn.setAttribute("y", "0");
      rowCloseBtn.setAttribute("dominant-baseline", "middle");
      rowCloseBtn.style.fontSize = "var(--ll-content-size, 14px)";
      rowCloseBtn.setAttribute("fill", "#999");
      rowCloseBtn.style.display = "none";
      rowCloseBtn.textContent = "\u00d7";
      rowItem.appendChild(rowCloseBtn);

      const rowLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      rowLine.setAttribute("x1", "0");
      rowLine.setAttribute("y1", "0");
      rowLine.setAttribute("x2", String(15 * fontScale));
      rowLine.setAttribute("y2", "0");
      rowLine.setAttribute("stroke", group.color);
      rowLine.setAttribute("stroke-width", String(strokeWidth));
      if (row.lineStyle.dash) {
        rowLine.setAttribute("stroke-dasharray", row.lineStyle.dash);
      }
      rowItem.appendChild(rowLine);

      const rowText = document.createElementNS("http://www.w3.org/2000/svg", "text");
      rowText.setAttribute("x", String(20 * fontScale));
      rowText.setAttribute("y", String(legendTextY));
      rowText.style.fontSize = "var(--ll-content-size, 14px)";
      rowText.setAttribute("fill", isDarkMode() ? "#ddd" : "#333");
      rowText.textContent = rowLabel;
      rowItem.appendChild(rowText);

      rowItem.addEventListener("mouseenter", () => { rowCloseBtn.style.display = "block"; });
      rowItem.addEventListener("mouseleave", () => { rowCloseBtn.style.display = "none"; });
      rowCloseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.pinnedRows.splice(rowIdx, 1);
        ctx.emit("pinnedRows", ctx.getSerializedPinnedRows());
        ctx.buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
      });

      legendG.appendChild(rowItem);
      legendY += legendEntryHeight;
    });
  } else {
    // Normal mode: show each group
    state.pinnedGroups.forEach((group, groupIdx) => {
      const groupLabel = ctx.getGroupLabel(group);
      const legendItem = document.createElementNS("http://www.w3.org/2000/svg", "g");
      legendItem.setAttribute(
        "transform",
        `translate(${legendIndent}, ${legendY})`
      );
      legendItem.style.cursor = "pointer";

      // Hit target
      const hitTarget = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      hitTarget.setAttribute("x", "-15");
      hitTarget.setAttribute("y", "-8");
      hitTarget.setAttribute("width", String(state.inputTokenWidth - 5));
      hitTarget.setAttribute("height", "14");
      hitTarget.setAttribute("fill", "transparent");
      legendItem.appendChild(hitTarget);

      // Close button
      const closeBtn = document.createElementNS("http://www.w3.org/2000/svg", "text");
      closeBtn.setAttribute("class", "legend-close");
      closeBtn.setAttribute("x", String(legendCloseX));
      closeBtn.setAttribute("y", "0");
      closeBtn.setAttribute("dominant-baseline", "middle");
      closeBtn.style.fontSize = "var(--ll-content-size, 14px)";
      closeBtn.setAttribute("fill", "#999");
      closeBtn.style.display = "none";
      closeBtn.textContent = "\u00d7";
      legendItem.appendChild(closeBtn);

      // Line sample
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", "0");
      line.setAttribute("y1", "0");
      line.setAttribute("x2", String(15 * fontScale));
      line.setAttribute("y2", "0");
      line.setAttribute("stroke", group.color);
      line.setAttribute("stroke-width", String(strokeWidth));
      legendItem.appendChild(line);

      // Label text
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", String(20 * fontScale));
      text.setAttribute("y", String(legendTextY));
      text.style.fontSize = "var(--ll-content-size, 14px)";
      text.setAttribute("fill", isDarkMode() ? "#ddd" : "#333");
      text.textContent = groupLabel;
      legendItem.appendChild(text);

      legendItem.addEventListener("mouseenter", () => {
        closeBtn.style.display = "block";
      });
      legendItem.addEventListener("mouseleave", () => {
        closeBtn.style.display = "none";
      });
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.pinnedGroups.splice(groupIdx, 1);
        if (state.lastPinnedGroupIndex >= state.pinnedGroups.length) {
          state.lastPinnedGroupIndex = state.pinnedGroups.length - 1;
        }
        ctx.emit("pinnedGroups", JSON.parse(JSON.stringify(state.pinnedGroups)));
        ctx.buildTable(
          state.currentCellWidth,
          state.currentVisibleIndices,
          state.currentMaxRows
        );
      });

      legendG.appendChild(legendItem);
      legendY += legendEntryHeight;
    });
  }

  // Hover trajectory
  if (hoverTrajectory && hoverLabel) {
    drawSingleTrajectory(
      trajG,
      hoverTrajectory,
      hoverColor || "#999",
      maxValue,
      hoverLabel,
      true,
      chartInnerWidth,
      "",
      state,
      data,
      dom,
      layerToX,
      chartInnerHeight,
      fontScale,
      isRankMode
    );

    const legendItem = document.createElementNS("http://www.w3.org/2000/svg", "g");
    legendItem.setAttribute("class", "legend-item hover-legend");
    legendItem.setAttribute(
      "transform",
      `translate(${legendIndent}, ${legendY})`
    );

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", "0");
    line.setAttribute("y1", "0");
    line.setAttribute("x2", String(15 * fontScale));
    line.setAttribute("y2", "0");
    line.setAttribute("stroke", hoverColor || "#999");
    line.setAttribute("stroke-width", String(strokeWidthHover));
    line.setAttribute(
      "stroke-dasharray",
      `${4 * fontScale},${2 * fontScale}`
    );
    line.style.opacity = "0.7";
    legendItem.appendChild(line);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(20 * fontScale));
    text.setAttribute("y", String(legendTextY));
    text.style.fontSize = "var(--ll-content-size, 14px)";
    text.setAttribute("fill", isDarkMode() ? "#aaa" : "#666");
    text.textContent = visualizeSpaces(hoverLabel);
    legendItem.appendChild(text);

    legendG.appendChild(legendItem);
  }

  // Append legend group last so it renders on top of chart content
  svg.appendChild(legendG);
}

function drawSingleTrajectory(
  g: SVGElement,
  trajectory: number[],
  color: string,
  maxValue: number,
  label: string,
  isHover: boolean,
  chartInnerWidth: number,
  dashPattern: string,
  state: WidgetState,
  data: NormalizedData,
  dom: DOMHelpers,
  layerToX: (layerIdx: number) => number,
  chartInnerHeight: number,
  fontScale: number,
  isRankMode: boolean = false
): void {
  if (!trajectory || trajectory.length === 0) return;

  const dotRadius = (isHover ? 2 : 3) * fontScale;
  const strokeWidth = (isHover ? 1.5 : 2) * fontScale;

  const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
  if (isHover) pathEl.style.opacity = "0.7";

  // For rank mode: rank 1 is at top (y=0), maxRank is at bottom
  // For probability mode: 0 is at bottom, maxProb is at top
  function valueToY(value: number): number {
    if (isRankMode) {
      // Rank 1 at top, maxValue at bottom (logarithmic scale for better visibility)
      if (value <= 0) return chartInnerHeight; // No data
      if (value === 1) return 0;
      // Use log scale for rank: log(1) = 0 at top, log(maxValue) at bottom
      const logMax = Math.log(maxValue);
      const logVal = Math.log(value);
      return (logVal / logMax) * chartInnerHeight;
    } else {
      // Probability: higher is up
      return chartInnerHeight - (value / maxValue) * chartInnerHeight;
    }
  }

  let d = "";
  trajectory.forEach((p, layerIdx) => {
    const x = layerToX(layerIdx);
    const y = valueToY(p);
    d += (layerIdx === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
  });

  pathEl.setAttribute("d", d);
  pathEl.setAttribute("fill", "none");
  pathEl.setAttribute("stroke", color);
  pathEl.setAttribute("stroke-width", String(strokeWidth));

  if (isHover) {
    pathEl.setAttribute(
      "stroke-dasharray",
      `${4 * fontScale},${2 * fontScale}`
    );
  } else if (dashPattern) {
    const scaledDash = dashPattern
      .split(",")
      .map((v) => parseFloat(v) * fontScale)
      .join(",");
    pathEl.setAttribute("stroke-dasharray", scaledDash);
  }
  g.appendChild(pathEl);

  // Draw dots at visible layer positions
  state.currentVisibleIndices.forEach((layerIdx) => {
    const p = trajectory[layerIdx];
    const x = layerToX(layerIdx);
    const y = valueToY(p);

    const circle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );
    circle.setAttribute("cx", x.toFixed(1));
    circle.setAttribute("cy", y.toFixed(1));
    circle.setAttribute("r", String(dotRadius));
    circle.setAttribute("fill", color);
    if (isHover) circle.style.opacity = "0.7";

    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    const tooltipValue = isRankMode
      ? `rank ${Math.round(p)}`
      : `${(p * 100).toFixed(2)}%`;
    title.textContent = `${label || ""} L${data.layers[layerIdx]}: ${tooltipValue}`;
    circle.appendChild(title);
    g.appendChild(circle);
  });
}
