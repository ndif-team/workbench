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
  svg,
} from "./utils";

/** Options for creating a legend entry */
interface LegendEntryOptions {
  x: number;
  y: number;
  label: string;
  labelColor: string;
  hitWidth: number;
  closeX: number;
  textY: number;
  fontScale: number;
  strokeWidth: number;
  // Optional line before label
  line?: {
    color: string;
    dash?: string;
  };
  // Whether label should be bold (for group headers)
  boldLabel?: boolean;
  onClose: (e: MouseEvent) => void;
}

/**
 * Create a legend entry with hit target, close button, optional line, and label.
 * Returns the container group element.
 */
function createLegendEntry(opts: LegendEntryOptions): SVGGElement {
  const g = svg("g", { transform: `translate(${opts.x}, ${opts.y})` }, { cursor: "pointer" });

  // Hit target for hover/click
  g.appendChild(svg("rect", {
    x: -15, y: -8,
    width: opts.hitWidth,
    height: 14,
    fill: "transparent",
  }));

  // Close button (hidden until hover)
  const closeBtn = svg("text", {
    class: "legend-close",
    x: opts.closeX,
    y: 0,
    "dominant-baseline": "middle",
    fill: "#999",
  }, { fontSize: "var(--ll-content-size, 14px)", display: "none" });
  closeBtn.textContent = "\u00d7";
  g.appendChild(closeBtn);

  // Optional line sample
  if (opts.line) {
    const line = svg("line", {
      x1: 0, y1: 0,
      x2: 15 * opts.fontScale, y2: 0,
      stroke: opts.line.color,
      "stroke-width": opts.strokeWidth,
    });
    if (opts.line.dash) {
      line.setAttribute("stroke-dasharray", opts.line.dash);
    }
    g.appendChild(line);
  }

  // Label text
  const textX = opts.line ? 20 * opts.fontScale : 0;
  const text = svg("text", {
    x: textX,
    y: opts.textY,
    fill: opts.labelColor,
  }, { fontSize: "var(--ll-content-size, 14px)" });
  if (opts.boldLabel) {
    text.style.fontWeight = "500";
  }
  text.textContent = opts.label;
  g.appendChild(text);

  // Hover behavior for close button
  g.addEventListener("mouseenter", () => { closeBtn.style.display = "block"; });
  g.addEventListener("mouseleave", () => { closeBtn.style.display = "none"; });
  closeBtn.addEventListener("click", opts.onClose);

  return g;
}

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

  const svgEl = dom.chart();
  if (!svgEl) return;
  svgEl.innerHTML = "";

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
  svgEl.appendChild(g);

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
  const xAxisGroup = svg("g", {}, { cursor: "row-resize" });
  const xAxisHoverBg = svg("rect", {
    x: 0, y: chartInnerHeight - 2, width: chartInnerWidth, height: 4,
    fill: "rgba(33, 150, 243, 0.3)",
  }, { display: "none" });
  xAxisGroup.appendChild(xAxisHoverBg);
  xAxisGroup.appendChild(svg("rect", {
    x: 0, y: chartInnerHeight - 4, width: chartInnerWidth, height: 8,
    fill: "transparent",
  }));
  const xAxis = svg("line", {
    x1: 0, y1: chartInnerHeight, x2: chartInnerWidth, y2: chartInnerHeight,
    stroke: "#ccc",
  });
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

  const defs = svg("defs");
  const clipId = `${uid}_chart_clip`;
  const clipPath = svg("clipPath", { id: clipId });
  clipPath.appendChild(svg("rect", {
    x: -clipLeftExtent, y: -clipTopExtent,
    width: chartInnerWidth + clipLeftExtent,
    height: chartInnerHeight + clipTopExtent + chartMargin.bottom + clipFontSize * 0.5,
  }));
  defs.appendChild(clipPath);

  const trajClipId = `${uid}_traj_clip`;
  const trajClipPath = svg("clipPath", { id: trajClipId });
  trajClipPath.appendChild(svg("rect", {
    x: 0, y: -clipTopExtent,
    width: chartInnerWidth,
    height: chartInnerHeight + clipTopExtent + 10,
  }));
  defs.appendChild(trajClipPath);

  svgEl.appendChild(defs);
  g.setAttribute("clip-path", `url(#${clipId})`);

  const trajG = svg("g", { "clip-path": `url(#${trajClipId})` });
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
  const yAxisGroup = svg("g", {}, { cursor: "col-resize" });
  const yAxisHoverBg = svg("rect", {
    x: -2, y: 0, width: 4, height: chartInnerHeight,
    fill: "rgba(33, 150, 243, 0.3)",
  }, { display: "none" });
  yAxisGroup.appendChild(yAxisHoverBg);
  yAxisGroup.appendChild(svg("rect", {
    x: -4, y: 0, width: 8, height: chartInnerHeight,
    fill: "transparent",
  }));
  const yAxis = svg("line", {
    x1: 0, y1: 0, x2: 0, y2: chartInnerHeight,
    stroke: "#ccc",
  });
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
  svgEl.appendChild(yLabel);

  // Determine positions to show: always include hover position + any pinned rows
  const positionsToShow: number[] = [];
  state.pinnedRows.forEach((pr) => positionsToShow.push(pr.pos));
  // Also include the current hover position if not already pinned
  if (!positionsToShow.includes(pos)) {
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
  // Common options for all legend entries
  const legendOpts = {
    hitWidth: state.inputTokenWidth - 5,
    closeX: legendCloseX,
    textY: legendTextY,
    fontScale,
    strokeWidth,
  };

  if (isMultiRowMode) {
    // Multi-row mode: group header (no line, bold) + row entries (with line)
    const group = state.pinnedGroups[0];

    // Group header entry (no line, colored text, outdented)
    legendG.appendChild(createLegendEntry({
      ...legendOpts,
      x: legendIndent - 5 * fontScale,
      y: legendY,
      label: ctx.getGroupLabel(group),
      labelColor: group.color,
      boldLabel: true,
      onClose: (e) => {
        e.stopPropagation();
        state.pinnedGroups.splice(0, 1);
        state.lastPinnedGroupIndex = -1;
        ctx.buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
      },
    }));
    legendY += legendEntryHeight;

    // Row entries with line styles
    state.pinnedRows.forEach((row, rowIdx) => {
      const token = data.tokens[row.pos] || `pos ${row.pos}`;
      legendG.appendChild(createLegendEntry({
        ...legendOpts,
        x: legendIndent,
        y: legendY,
        label: visualizeSpaces(token),
        labelColor: isDarkMode() ? "#ddd" : "#333",
        line: { color: group.color, dash: row.lineStyle.dash },
        onClose: (e) => {
          e.stopPropagation();
          state.pinnedRows.splice(rowIdx, 1);
          ctx.emit("pinnedRows", ctx.getSerializedPinnedRows());
          ctx.buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
        },
      }));
      legendY += legendEntryHeight;
    });
  } else {
    // Normal mode: show each group with line sample
    state.pinnedGroups.forEach((group, groupIdx) => {
      legendG.appendChild(createLegendEntry({
        ...legendOpts,
        x: legendIndent,
        y: legendY,
        label: ctx.getGroupLabel(group),
        labelColor: isDarkMode() ? "#ddd" : "#333",
        line: { color: group.color },
        onClose: (e) => {
          e.stopPropagation();
          state.pinnedGroups.splice(groupIdx, 1);
          if (state.lastPinnedGroupIndex >= state.pinnedGroups.length) {
            state.lastPinnedGroupIndex = state.pinnedGroups.length - 1;
          }
          ctx.emit("pinnedGroups", JSON.parse(JSON.stringify(state.pinnedGroups)));
          ctx.buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
        },
      }));
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
  svgEl.appendChild(legendG);
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
