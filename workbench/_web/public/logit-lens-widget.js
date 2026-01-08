"use strict";
var LogitLensWidgetModule = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/lib/logit-lens-widget/index.ts
  var index_exports = {};
  __export(index_exports, {
    LogitLensWidget: () => LogitLensWidget,
    default: () => index_default
  });

  // src/lib/logit-lens-widget/types.ts
  var ENTROPY_COLOR_MODE = "entropy";
  var LINE_STYLES = [
    { dash: "", name: "solid" },
    { dash: "8,4", name: "dashed" },
    { dash: "2,3", name: "dotted" },
    { dash: "8,4,2,4", name: "dash-dot" }
  ];
  var COLORS = [
    "#2196F3",
    "#e91e63",
    "#4CAF50",
    "#FF9800",
    "#9C27B0",
    "#00BCD4",
    "#F44336",
    "#8BC34A"
  ];
  var MIN_CHART_HEIGHT = 60;
  var MAX_CHART_HEIGHT = 400;
  var MIN_CELL_WIDTH = 10;
  var MAX_CELL_WIDTH = 200;
  var DEFAULT_BASE_COLOR = "#8844ff";
  var DEFAULT_NEXT_COLOR = "#cc6622";

  // src/lib/logit-lens-widget/normalize.ts
  function getProbTrajectory(tracked) {
    if (!tracked) return [];
    if (Array.isArray(tracked)) return tracked;
    return tracked.prob || [];
  }
  function isV2Format(data) {
    return !("cells" in data) && "topk" in data && "tracked" in data;
  }
  function normalizeData(data) {
    if ("cells" in data && data.cells) {
      const tokens = data.tokens || data.input || [];
      return {
        layers: data.layers,
        tokens,
        cells: data.cells,
        meta: data.meta || {}
      };
    }
    if (!isV2Format(data)) {
      throw new Error("Invalid data format: expected V1 or V2 format");
    }
    const nLayers = data.layers.length;
    const nPositions = data.input.length;
    const cells = [];
    for (let pos = 0; pos < nPositions; pos++) {
      const posData = [];
      const trackedAtPos = data.tracked[pos];
      for (let li = 0; li < nLayers; li++) {
        const topkTokens = data.topk[li][pos];
        const topkList = [];
        for (let ki = 0; ki < topkTokens.length; ki++) {
          const tok = topkTokens[ki];
          const trajectory = getProbTrajectory(trackedAtPos[tok]);
          const prob = trajectory[li] || 0;
          topkList.push({
            token: tok,
            prob,
            trajectory
          });
        }
        const top1 = topkList[0] || { token: "", prob: 0, trajectory: [] };
        posData.push({
          token: top1.token,
          prob: top1.prob,
          trajectory: top1.trajectory,
          topk: topkList
        });
      }
      cells.push(posData);
    }
    return {
      layers: data.layers,
      tokens: data.input,
      cells,
      meta: data.meta || {}
    };
  }

  // src/lib/logit-lens-widget/styles.ts
  function generateStyles(uid) {
    return `
    #${uid} {
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 0;
      position: relative;
      -webkit-user-select: none;
      user-select: none;
    }
    #${uid} .ll-title { font-size: var(--ll-title-size, 14px); font-weight: 600; margin-bottom: 8px; padding: 2px 0; }
    #${uid} .color-mode-btn {
      display: inline-block; padding: 0; background: transparent;
      border-radius: 4px; font-size: var(--ll-title-size, 14px); cursor: pointer; color: #333;
      border: none;
    }
    #${uid} .color-mode-btn:hover { background: rgba(0,0,0,0.05); }
    #${uid} .ll-table { border-collapse: collapse; font-size: var(--ll-content-size, 14px); table-layout: fixed; }
    #${uid} .ll-table td, #${uid} .ll-table th { border: 1px solid #ddd; box-sizing: border-box; }
    #${uid} .pred-cell {
      height: 22px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      padding: 2px 4px; font-family: "JetBrains Mono", monospace; font-size: calc(var(--ll-content-size, 14px) * 0.9); cursor: pointer; position: relative;
    }
    #${uid} .pred-cell:hover { outline: 2px solid #e91e63; outline-offset: -1px; }
    #${uid} .pred-cell.selected { background: #fff59d !important; color: #333 !important; }
    #${uid} .input-token {
      padding: 2px 8px; text-align: right; font-weight: 500; color: #333;
      background: #f5f5f5; white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis; font-family: "JetBrains Mono", monospace; font-size: var(--ll-content-size, 14px); cursor: pointer;
      position: relative;
    }
    #${uid} .input-token:hover { background: #e8e8e8; }
    #${uid} tr:has(.input-token:hover) { outline: 2px solid rgba(255, 193, 7, 0.8); outline-offset: -1px; }
    #${uid} tr:has(.input-token:hover) .input-token { background: #fff59d !important; }
    #${uid} tr.external-hover { outline: 2px solid rgba(33, 150, 243, 0.6); outline-offset: -1px; }
    #${uid} tr.external-hover .input-token { background: #e3f2fd !important; }
    #${uid} .layer-hdr {
      padding: 4px 2px; text-align: center; font-weight: 500; color: #666;
      background: #f5f5f5; font-size: calc(var(--ll-content-size, 14px) * 0.9); position: relative;
    }
    #${uid} .corner-hdr { padding: 4px 8px; text-align: right; font-weight: 500; color: #666; background: white; position: relative; }
    #${uid} .chart-container { margin-top: 8px; background: #fafafa; border-radius: 4px; padding: 8px 0; }
    #${uid} .chart-container > svg { display: block; margin: 0; padding: 0; }
    #${uid} .input-token svg { display: inline-block; vertical-align: middle; }
    #${uid} .popup {
      display: none; position: absolute; background: white; border: 1px solid #ddd;
      border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); padding: 12px;
      z-index: 100; min-width: 180px; max-width: 280px;
    }
    #${uid} .popup.visible { display: block; }
    #${uid} .popup-header { font-weight: 600; font-size: min(var(--ll-title-size, 14px), calc((var(--ll-content-size, 14px) + var(--ll-title-size, 14px)) / 2)); margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #eee; }
    #${uid} .popup-header code { font-weight: 400; font-size: min(var(--ll-title-size, 14px), calc((var(--ll-content-size, 14px) + var(--ll-title-size, 14px)) / 2)); background: #f5f5f5; padding: 2px 6px; border-radius: 3px; margin-left: 4px; font-family: "JetBrains Mono", monospace; }
    #${uid} .popup-close { position: absolute; top: 8px; right: 10px; cursor: pointer; color: #999; font-size: var(--ll-title-size, 14px); }
    #${uid} .popup-close:hover { color: #333; }
    #${uid} .topk-item {
      padding: 4px 6px; margin: 2px 0; border-radius: 3px; cursor: pointer;
      display: flex; justify-content: space-between;
      font-size: min(var(--ll-title-size, 14px), calc((var(--ll-content-size, 14px) + var(--ll-title-size, 14px)) / 2));
    }
    #${uid} .topk-item:hover { background: #f0f0f0; }
    #${uid} .topk-item.active { background: #f0f0f0; }
    #${uid} .topk-token { font-family: "JetBrains Mono", monospace; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #${uid} .topk-prob { color: #666; margin-left: 8px; }
    #${uid} .topk-item.pinned { border-left: 3px solid currentColor; }
    #${uid} .resize-handle {
      position: absolute; width: 6px; height: 100%; background: transparent;
      cursor: col-resize; right: -3px; top: 0; z-index: 10;
    }
    #${uid} .resize-handle:hover, #${uid} .resize-handle.dragging { background: rgba(33, 150, 243, 0.4); }
    #${uid} .resize-handle-input {
      position: absolute; width: 6px; height: 100%; background: transparent;
      cursor: col-resize; right: -3px; top: 0; z-index: 10;
    }
    #${uid} .resize-handle-input:hover, #${uid} .resize-handle-input.dragging { background: rgba(76, 175, 80, 0.4); }
    #${uid} .table-wrapper { position: relative; display: inline-block; }
    #${uid} .resize-handle-bottom {
      position: absolute; bottom: -3px; left: 0; right: 0; height: 6px;
      cursor: row-resize; background: transparent;
    }
    #${uid} .resize-handle-bottom:hover, #${uid} .resize-handle-bottom.dragging { background: rgba(33, 150, 243, 0.4); }
    #${uid} .resize-handle-right {
      position: absolute; top: 0; bottom: 0; right: -3px; width: 6px;
      cursor: ew-resize; background: transparent;
    }
    #${uid} .resize-handle-right:hover, #${uid} .resize-handle-right.dragging { background: rgba(33, 150, 243, 0.4); }
    #${uid} .resize-hint { font-size: calc(var(--ll-content-size, 14px) * 0.9); color: #999; margin-top: 4px; cursor: default; }
    #${uid} .resize-hint-extra { display: none; }
    #${uid}.show-all-handles .resize-handle,
    #${uid}.show-all-handles .resize-handle-input,
    #${uid}.show-all-handles .resize-handle-right { background: rgba(33, 150, 243, 0.3); }
    #${uid} .color-menu {
      display: none; position: absolute; background: white; border: 1px solid #ddd;
      border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); z-index: 200; min-width: 150px;
    }
    #${uid} .color-menu.visible { display: block; }
    #${uid} .color-menu-item { padding: 0; cursor: pointer; font-size: min(var(--ll-title-size, 14px), calc((var(--ll-content-size, 14px) + var(--ll-title-size, 14px)) / 2)); display: flex; align-items: stretch; }
    #${uid} .color-menu-item:hover, #${uid} .color-menu-item.picking { background: #f0f0f0; }
    #${uid} .color-menu-item .color-menu-label { padding: 8px 12px 8px 0; flex: 1; }
    #${uid} .color-menu-item .color-swatch { width: 32px; height: auto; min-height: 24px; border: 0; border-left: 1px solid #ccc; background: transparent; cursor: pointer; opacity: 0; transition: opacity 0.15s; padding: 0; -webkit-appearance: none; -moz-appearance: none; appearance: none; }
    #${uid} .color-menu-item:hover .color-swatch, #${uid} .color-menu-item.picking .color-swatch { opacity: 1; }
    #${uid} .color-menu-item .color-swatch:hover { border-left-color: #666; }
    #${uid} .legend-close { cursor: pointer; }
    #${uid} .legend-close:hover { fill: #e91e63 !important; }
    @keyframes menuBlink-${uid} {
      0% { background: #f0f0f0; }
      50% { background: #d0d0d0; }
      100% { background: #f0f0f0; }
    }
    /* Dark mode styles */
    #${uid}.dark-mode { background: #1e1e1e; color: #e0e0e0; }
    #${uid}.dark-mode .ll-title { color: #e0e0e0; }
    #${uid}.dark-mode .color-mode-btn { background: transparent; color: #e0e0e0; }
    #${uid}.dark-mode .color-mode-btn:hover { background: rgba(255,255,255,0.1); }
    #${uid}.dark-mode .ll-table td, #${uid}.dark-mode .ll-table th { border-color: #444; }
    #${uid}.dark-mode .pred-cell { color: #e0e0e0; }
    #${uid}.dark-mode .pred-cell.selected { background: #4a4a00 !important; color: #fff !important; }
    #${uid}.dark-mode .input-token { background: #2d2d2d; color: #e0e0e0; }
    #${uid}.dark-mode .input-token:hover { background: #3d3d3d; }
    #${uid}.dark-mode tr:has(.input-token:hover) .input-token { background: #4a4a00 !important; color: #fff !important; }
    #${uid}.dark-mode tr.external-hover { outline: 2px solid rgba(33, 150, 243, 0.6); outline-offset: -1px; }
    #${uid}.dark-mode tr.external-hover .input-token { background: #1a3a5c !important; color: #e0e0e0 !important; }
    #${uid}.dark-mode .layer-hdr { background: #2d2d2d; color: #aaa; }
    #${uid}.dark-mode .corner-hdr { background: #1e1e1e; color: #aaa; }
    #${uid}.dark-mode .chart-container { background: #252525; }
    #${uid}.dark-mode .popup { background: #2d2d2d; border-color: #444; color: #e0e0e0; }
    #${uid}.dark-mode .popup-header { border-bottom-color: #444; }
    #${uid}.dark-mode .popup-header code { background: #3d3d3d; color: #e0e0e0; }
    #${uid}.dark-mode .popup-close { color: #888; }
    #${uid}.dark-mode .popup-close:hover { color: #e0e0e0; }
    #${uid}.dark-mode .topk-item:hover { background: #3d3d3d; }
    #${uid}.dark-mode .topk-item.active { background: #3d3d3d; }
    #${uid}.dark-mode .topk-prob { color: #aaa; }
    #${uid}.dark-mode .color-menu { background: #2d2d2d; border-color: #444; }
    #${uid}.dark-mode .color-menu-item:hover, #${uid}.dark-mode .color-menu-item.picking { background: #3d3d3d; }
    #${uid}.dark-mode .color-menu-item .color-swatch { border-left-color: #555; }
    #${uid}.dark-mode .resize-hint { color: #888; }
    @keyframes menuBlink-${uid}-dark {
      0% { background: #3d3d3d; }
      50% { background: #4d4d4d; }
      100% { background: #3d3d3d; }
    }
  `;
  }
  function generateHTML(uid) {
    return `
    <div id="${uid}">
      <div class="ll-title" id="${uid}_title">Logit Lens: Top Predictions by Layer</div>
      <div class="table-wrapper">
        <table class="ll-table" id="${uid}_table"></table>
        <div class="resize-handle-bottom" id="${uid}_resize_bottom"></div>
        <div class="resize-handle-right" id="${uid}_resize_right"></div>
      </div>
      <div class="resize-hint" id="${uid}_resize_hint">drag column borders to resize</div>
      <div class="chart-container" id="${uid}_chart_container">
        <svg id="${uid}_chart" height="140"></svg>
      </div>
      <div class="popup" id="${uid}_popup">
        <span class="popup-close" id="${uid}_popup_close">&times;</span>
        <div class="popup-header">
          Layer <span id="${uid}_popup_layer"></span>, Position <span id="${uid}_popup_pos"></span>
        </div>
        <div id="${uid}_popup_content"></div>
      </div>
      <input type="color" id="${uid}_color_picker" style="position: absolute; opacity: 0; pointer-events: none;">
      <div class="color-menu" id="${uid}_color_menu"></div>
    </div>
  `;
  }

  // src/lib/logit-lens-widget/utils.ts
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
  function niceMax(p) {
    if (p >= 0.95) return 1;
    const niceValues = [3e-3, 5e-3, 0.01, 0.02, 0.03, 0.05, 0.1, 0.2, 0.3, 0.5, 1];
    for (const v of niceValues) {
      if (p <= v) return v;
    }
    return 1;
  }
  function formatPct(p) {
    const pct = p * 100;
    if (pct >= 1) return Math.round(pct) + "%";
    if (pct >= 0.1) return pct.toFixed(1) + "%";
    return pct.toFixed(2) + "%";
  }
  function normalizeForComparison(token) {
    return token.replace(/[\s.,!?;:'"()\[\]{}\-_]/g, "").toLowerCase();
  }
  function hasSimilarTokensInList(topkList, targetToken) {
    const targetNorm = normalizeForComparison(targetToken);
    if (!targetNorm) return false;
    for (const item of topkList) {
      if (item.token === targetToken) continue;
      const otherNorm = normalizeForComparison(item.token);
      if (otherNorm && otherNorm === targetNorm) {
        return true;
      }
    }
    return false;
  }
  var INVISIBLE_ENTITY_MAP = {
    "\xA0": "&nbsp;",
    // Non-breaking space
    "\xAD": "&shy;",
    // Soft hyphen
    "\u200B": "&#8203;",
    // Zero-width space
    "\u200C": "&zwnj;",
    // Zero-width non-joiner
    "\u200D": "&zwj;",
    // Zero-width joiner
    "\uFEFF": "&#65279;",
    // Zero-width no-break space (BOM)
    "\u2060": "&#8288;",
    // Word joiner
    "\u2002": "&ensp;",
    // En space
    "\u2003": "&emsp;",
    // Em space
    "\u2009": "&thinsp;",
    // Thin space
    "\u200A": "&#8202;",
    // Hair space
    "\u2006": "&#8198;",
    // Six-per-em space
    "\u2008": "&#8200;",
    // Punctuation space
    "\u200E": "&lrm;",
    // Left-to-right mark
    "\u200F": "&rlm;",
    // Right-to-left mark
    "	": "&#9;",
    // Tab
    "\n": "&#10;",
    // Newline
    "\r": "&#13;"
    // Carriage return
  };
  function visualizeSpaces(text, spellOutEntities = false) {
    let result = text;
    if (spellOutEntities) {
      let output = "";
      for (const ch of result) {
        if (INVISIBLE_ENTITY_MAP[ch]) {
          output += INVISIBLE_ENTITY_MAP[ch];
        } else {
          output += ch;
        }
      }
      result = output;
    }
    let leadingSpaces = 0;
    while (leadingSpaces < result.length && result[leadingSpaces] === " ") {
      leadingSpaces++;
    }
    if (leadingSpaces > 0) {
      result = "\u02FD".repeat(leadingSpaces) + result.slice(leadingSpaces);
    }
    let trailingSpaces = 0;
    while (trailingSpaces < result.length && result[result.length - 1 - trailingSpaces] === " ") {
      trailingSpaces++;
    }
    if (trailingSpaces > 0) {
      result = result.slice(0, result.length - trailingSpaces) + "\u02FD".repeat(trailingSpaces);
    }
    return result;
  }
  function createDOMHelpers(uid) {
    return {
      widget: () => document.getElementById(uid),
      table: () => document.getElementById(uid + "_table"),
      chart: () => document.getElementById(uid + "_chart"),
      popup: () => document.getElementById(uid + "_popup"),
      popupClose: () => document.getElementById(uid + "_popup_close"),
      popupLayer: () => document.getElementById(uid + "_popup_layer"),
      popupPos: () => document.getElementById(uid + "_popup_pos"),
      popupContent: () => document.getElementById(uid + "_popup_content"),
      colorMenu: () => document.getElementById(uid + "_color_menu"),
      colorBtn: () => document.getElementById(uid + "_color_btn"),
      colorPicker: () => document.getElementById(uid + "_color_picker"),
      title: () => document.getElementById(uid + "_title"),
      titleText: () => document.getElementById(uid + "_title_text"),
      overlay: () => document.getElementById(uid + "_overlay"),
      resizeHint: () => document.getElementById(uid + "_resize_hint"),
      resizeBottom: () => document.getElementById(uid + "_resize_bottom"),
      resizeRight: () => document.getElementById(uid + "_resize_right"),
      chartContainer: () => document.getElementById(uid + "_chart_container"),
      tableWrapper: () => document.getElementById(uid)?.querySelector(".table-wrapper")
    };
  }
  function getContentFontSizePx(dom) {
    const widgetEl = dom.widget();
    if (!widgetEl) return 14;
    const style = getComputedStyle(widgetEl);
    const sizeStr = style.getPropertyValue("--ll-content-size").trim() || "14px";
    const match = sizeStr.match(/^([\d.]+)px$/);
    return match ? parseFloat(match[1]) : 14;
  }
  function getChartMargin(dom) {
    const fontSize = getContentFontSizePx(dom);
    return {
      top: Math.max(10, fontSize * 1.2),
      right: 8,
      bottom: Math.max(25, fontSize * 1.5),
      left: 10
    };
  }
  function getDefaultChartHeight(dom) {
    const fontSize = getContentFontSizePx(dom);
    const topMargin = Math.max(10, fontSize * 1.2);
    const bottomMargin = Math.max(25, fontSize * 1.5);
    const table = dom.table();
    let rowHeight = fontSize * 2;
    if (table) {
      const rows = table.querySelectorAll("tr");
      if (rows.length >= 2) {
        rowHeight = rows[1].getBoundingClientRect().height || rowHeight;
      }
    }
    const innerHeight = rowHeight * 6;
    return topMargin + innerHeight + bottomMargin;
  }

  // src/lib/logit-lens-widget/chart.ts
  function drawAllTrajectories(ctx, hoverTrajectory, hoverColor, hoverLabel, chartInnerWidth, pos) {
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
    const actualInputRight = inputCellRect ? inputCellRect.right - tableRect.left : state.inputTokenWidth;
    const legendG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    legendG.setAttribute("class", "legend-area");
    const chartMargin = getChartMargin(dom);
    const chartHeight = getActualChartHeight();
    const chartInnerHeight = chartHeight - chartMargin.top - chartMargin.bottom;
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute(
      "transform",
      `translate(${actualInputRight},${chartMargin.top})`
    );
    svg.appendChild(g);
    const fontScale = getContentFontSizePx(dom) / 10;
    const dotRadius = 3 * fontScale;
    const strokeWidth = 2 * fontScale;
    const strokeWidthHover = 1.5 * fontScale;
    const labelMargin = chartMargin.right;
    const usableWidth = chartInnerWidth - labelMargin;
    function layerToX(layerIdx) {
      if (nLayers <= 1) return usableWidth / 2;
      const visibleLayerRange = nLayers - 1 - state.plotMinLayer;
      if (visibleLayerRange <= 0) return usableWidth / 2;
      return dotRadius + (layerIdx - state.plotMinLayer) / visibleLayerRange * (usableWidth - 2 * dotRadius);
    }
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
        startHeight: getActualChartHeight()
      };
      xAxis.setAttribute("stroke", "rgba(33, 150, 243, 0.6)");
      e.preventDefault();
      e.stopPropagation();
    });
    const clipFontSize = getContentFontSizePx(dom);
    const clipLeftExtent = 10 + clipFontSize * 5;
    const clipTopExtent = clipFontSize * 1.2;
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
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
    const trajG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    trajG.setAttribute("clip-path", `url(#${trajClipId})`);
    g.appendChild(trajG);
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
    const showAtIndex = /* @__PURE__ */ new Set();
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
            const bg = tickGroup.querySelector(".tick-hover-bg");
            if (bg) bg.style.display = "block";
          });
          tickGroup.addEventListener("mouseleave", () => {
            const bg = tickGroup.querySelector(".tick-hover-bg");
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
              dotRadius
            };
            e.preventDefault();
            e.stopPropagation();
          });
        }
        g.appendChild(tickGroup);
      }
    });
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
        startWidth: state.inputTokenWidth
      };
      yAxis.setAttribute("stroke", "rgba(33, 150, 243, 0.6)");
      e.preventDefault();
      e.stopPropagation();
    });
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
    const positionsToShow = [];
    if (state.pinnedRows.length > 0) {
      state.pinnedRows.forEach((pr) => positionsToShow.push(pr.pos));
    } else {
      positionsToShow.push(pos);
    }
    let allValues = [];
    positionsToShow.forEach((showPos) => {
      state.pinnedGroups.forEach((group) => {
        const traj = ctx.getGroupTrajectory(group, showPos);
        if (traj) {
          allValues = allValues.concat(traj);
        }
      });
    });
    if (hoverTrajectory) allValues = allValues.concat(hoverTrajectory);
    let maxValue;
    let tickLabelText;
    const isRankMode = metric === "rank";
    if (isRankMode) {
      const rawMax = Math.max(...allValues, 1);
      maxValue = rawMax <= 10 ? 10 : rawMax <= 100 ? 100 : rawMax <= 1e3 ? 1e3 : Math.ceil(rawMax / 1e3) * 1e3;
      tickLabelText = String(Math.round(maxValue));
    } else {
      const rawMaxProb = Math.max(...allValues, 1e-3);
      maxValue = niceMax(rawMaxProb);
      tickLabelText = formatPct(maxValue);
    }
    const hasData = state.pinnedGroups.length > 0 || hoverTrajectory && hoverLabel;
    if (hasData) {
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
    const legendStartY = chartMargin.top + Math.max(10 * fontScale, (chartInnerHeight - legendTotalHeight) / 2);
    let legendY = legendStartY;
    const isMultiRowMode = state.pinnedRows.length > 1 && state.pinnedGroups.length === 1;
    const legendLabels = [];
    let legendRightEdge;
    if (isMultiRowMode) {
      const groupLabel = ctx.getGroupLabel(state.pinnedGroups[0]);
      const rowLabels = [];
      state.pinnedRows.forEach((row) => {
        const token = data.tokens[row.pos] || `pos ${row.pos}`;
        rowLabels.push(visualizeSpaces(token));
      });
      const groupLabelWidth = groupLabel.length * 7 * fontScale;
      const groupRightEdge = legendIndent - 5 * fontScale + groupLabelWidth;
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
    if (legendProtrudesIntoChart) {
      const bgPadding = 3 * fontScale;
      const closeButtonSpace = 15;
      const legendLeftEdge = isMultiRowMode ? legendIndent - 5 * fontScale - bgPadding - closeButtonSpace : legendIndent - bgPadding - closeButtonSpace;
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
    positionsToShow.forEach((showPos) => {
      const lineStyle = ctx.getLineStyleForRow(showPos);
      state.pinnedGroups.forEach((group) => {
        const traj = ctx.getGroupTrajectory(group, showPos);
        if (!traj) return;
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
    if (isMultiRowMode) {
      const group = state.pinnedGroups[0];
      const groupLabel = ctx.getGroupLabel(group);
      const rowIndent = legendIndent + 10 * fontScale;
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
      groupCloseBtn.textContent = "\xD7";
      groupItem.appendChild(groupCloseBtn);
      const groupText = document.createElementNS("http://www.w3.org/2000/svg", "text");
      groupText.setAttribute("x", "0");
      groupText.setAttribute("y", String(legendTextY));
      groupText.style.fontSize = "var(--ll-content-size, 14px)";
      groupText.setAttribute("fill", group.color);
      groupText.style.fontWeight = "500";
      groupText.textContent = groupLabel;
      groupItem.appendChild(groupText);
      groupItem.addEventListener("mouseenter", () => {
        groupCloseBtn.style.display = "block";
      });
      groupItem.addEventListener("mouseleave", () => {
        groupCloseBtn.style.display = "none";
      });
      groupCloseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.pinnedGroups.splice(0, 1);
        state.lastPinnedGroupIndex = -1;
        ctx.buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
      });
      legendG.appendChild(groupItem);
      legendY += legendEntryHeight;
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
        rowCloseBtn.textContent = "\xD7";
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
        rowItem.addEventListener("mouseenter", () => {
          rowCloseBtn.style.display = "block";
        });
        rowItem.addEventListener("mouseleave", () => {
          rowCloseBtn.style.display = "none";
        });
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
      state.pinnedGroups.forEach((group, groupIdx) => {
        const groupLabel = ctx.getGroupLabel(group);
        const legendItem = document.createElementNS("http://www.w3.org/2000/svg", "g");
        legendItem.setAttribute(
          "transform",
          `translate(${legendIndent}, ${legendY})`
        );
        legendItem.style.cursor = "pointer";
        const hitTarget = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        hitTarget.setAttribute("x", "-15");
        hitTarget.setAttribute("y", "-8");
        hitTarget.setAttribute("width", String(state.inputTokenWidth - 5));
        hitTarget.setAttribute("height", "14");
        hitTarget.setAttribute("fill", "transparent");
        legendItem.appendChild(hitTarget);
        const closeBtn = document.createElementNS("http://www.w3.org/2000/svg", "text");
        closeBtn.setAttribute("class", "legend-close");
        closeBtn.setAttribute("x", String(legendCloseX));
        closeBtn.setAttribute("y", "0");
        closeBtn.setAttribute("dominant-baseline", "middle");
        closeBtn.style.fontSize = "var(--ll-content-size, 14px)";
        closeBtn.setAttribute("fill", "#999");
        closeBtn.style.display = "none";
        closeBtn.textContent = "\xD7";
        legendItem.appendChild(closeBtn);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", "0");
        line.setAttribute("y1", "0");
        line.setAttribute("x2", String(15 * fontScale));
        line.setAttribute("y2", "0");
        line.setAttribute("stroke", group.color);
        line.setAttribute("stroke-width", String(strokeWidth));
        legendItem.appendChild(line);
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
    svg.appendChild(legendG);
  }
  function drawSingleTrajectory(g, trajectory, color, maxValue, label, isHover, chartInnerWidth, dashPattern, state, data, dom, layerToX, chartInnerHeight, fontScale, isRankMode = false) {
    if (!trajectory || trajectory.length === 0) return;
    const dotRadius = (isHover ? 2 : 3) * fontScale;
    const strokeWidth = (isHover ? 1.5 : 2) * fontScale;
    const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
    if (isHover) pathEl.style.opacity = "0.7";
    function valueToY(value) {
      if (isRankMode) {
        if (value <= 0) return chartInnerHeight;
        if (value === 1) return 0;
        const logMax = Math.log(maxValue);
        const logVal = Math.log(value);
        return logVal / logMax * chartInnerHeight;
      } else {
        return chartInnerHeight - value / maxValue * chartInnerHeight;
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
      const scaledDash = dashPattern.split(",").map((v) => parseFloat(v) * fontScale).join(",");
      pathEl.setAttribute("stroke-dasharray", scaledDash);
    }
    g.appendChild(pathEl);
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
      const tooltipValue = isRankMode ? `rank ${Math.round(p)}` : `${(p * 100).toFixed(2)}%`;
      title.textContent = `${label || ""} L${data.layers[layerIdx]}: ${tooltipValue}`;
      circle.appendChild(title);
      g.appendChild(circle);
    });
  }

  // src/lib/logit-lens-widget/index.ts
  function generateUid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return "ll_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    }
    return "ll_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function LogitLensWidget(containerArg, widgetData, uiState) {
    const uid = generateUid();
    let container;
    if (typeof containerArg === "string") {
      container = document.querySelector(containerArg);
    } else if (containerArg instanceof Element) {
      container = containerArg;
    } else {
      container = null;
    }
    if (!container) {
      console.error("Container not found:", containerArg);
      return void 0;
    }
    const data = normalizeData(widgetData);
    const style = document.createElement("style");
    style.textContent = generateStyles(uid);
    document.head.appendChild(style);
    container.innerHTML = generateHTML(uid);
    const nLayers = data.layers.length;
    const nPositions = data.tokens.length;
    const defaultNextToken = data.cells[nPositions - 1][nLayers - 1].token;
    const dom = createDOMHelpers(uid);
    const state = {
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
      pinnedGroups: uiState?.pinnedGroups ? JSON.parse(JSON.stringify(uiState.pinnedGroups)) : [],
      pinnedRows: [],
      lastPinnedGroupIndex: uiState?.lastPinnedGroupIndex ?? -1,
      colorModes: uiState?.colorModes ? uiState.colorModes.slice() : uiState?.colorMode && uiState.colorMode !== "none" ? [uiState.colorMode] : uiState?.colorMode === "none" ? [] : ["top", defaultNextToken],
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
        dotRadius: 0
      },
      rightEdgeDrag: {
        active: false,
        startX: 0,
        startTableWidth: 0,
        hadMaxTableWidth: false,
        startMaxTableWidth: null
      }
    };
    const listeners = /* @__PURE__ */ new Map();
    function on(event, listener) {
      if (!listeners.has(event)) {
        listeners.set(event, /* @__PURE__ */ new Set());
      }
      listeners.get(event).add(listener);
    }
    function off(event, listener) {
      const set = listeners.get(event);
      if (set) {
        set.delete(listener);
      }
    }
    function emit(event, value) {
      const set = listeners.get(event);
      if (set) {
        for (const listener of set) {
          listener(value);
        }
      }
    }
    let trajectoryMetric = uiState?.trajectoryMetric ?? "probability";
    function hasRankData() {
      const v2Data = widgetData;
      if (!v2Data.tracked || v2Data.tracked.length === 0) return false;
      for (const posTracked of v2Data.tracked) {
        for (const val of Object.values(posTracked)) {
          if (typeof val === "object" && "rank" in val && Array.isArray(val.rank)) {
            return true;
          }
        }
      }
      return false;
    }
    function hasEntropyData() {
      const v2Data = widgetData;
      return Array.isArray(v2Data.entropy) && v2Data.entropy.length > 0;
    }
    function getSerializedPinnedRows() {
      return state.pinnedRows.map((pr) => ({
        pos: pr.pos,
        line: pr.lineStyle.name
      }));
    }
    let didAutoPinLastRow = false;
    if (uiState?.pinnedRows !== void 0) {
      state.pinnedRows = uiState.pinnedRows.map((pr) => {
        const lineStyle = LINE_STYLES.find((ls) => ls.name === pr.line) || LINE_STYLES[0];
        return { pos: pr.pos, lineStyle };
      });
    } else {
      state.pinnedRows = [{ pos: nPositions - 1, lineStyle: LINE_STYLES[0] }];
      didAutoPinLastRow = true;
    }
    function isDarkMode() {
      if (state.darkModeOverride !== null) {
        return state.darkModeOverride;
      }
      return getComputedStyle(container).colorScheme === "dark";
    }
    function getActualChartHeight() {
      return state.chartHeight !== null ? state.chartHeight : getDefaultChartHeight(dom);
    }
    function getNextColor() {
      const c = COLORS[state.colorIndex % COLORS.length];
      state.colorIndex++;
      return c;
    }
    function getColorForToken(token) {
      for (const group of state.pinnedGroups) {
        if (group.tokens.includes(token)) return group.color;
      }
      return null;
    }
    function findGroupForToken(token) {
      for (let i = 0; i < state.pinnedGroups.length; i++) {
        if (state.pinnedGroups[i].tokens.includes(token)) return i;
      }
      return -1;
    }
    function getGroupLabel(group) {
      return group.tokens.map((t) => visualizeSpaces(t)).join("+");
    }
    function isTokenTracked(token, pos) {
      const v2Data = widgetData;
      if (v2Data.tracked && v2Data.tracked[pos]) {
        return token in v2Data.tracked[pos];
      }
      for (let li = 0; li < data.cells[pos].length; li++) {
        const cellData = data.cells[pos][li];
        if (cellData.token === token) return true;
        for (const item of cellData.topk) {
          if (item.token === token) return true;
        }
      }
      return false;
    }
    function getTrajectoryForToken(token, pos) {
      const v2Data = widgetData;
      if (v2Data.tracked && v2Data.tracked[pos]) {
        const trackedItem = v2Data.tracked[pos][token];
        if (!trackedItem) return null;
        if (Array.isArray(trackedItem)) return trackedItem;
        if (typeof trackedItem === "object" && "prob" in trackedItem) {
          return trackedItem.prob;
        }
      }
      for (let li = 0; li < data.cells[pos].length; li++) {
        const cellData = data.cells[pos][li];
        if (cellData.token === token) return cellData.trajectory;
        for (const item of cellData.topk) {
          if (item.token === token) return item.trajectory;
        }
      }
      return null;
    }
    function getRankTrajectoryForToken(token, pos) {
      const v2Data = widgetData;
      if (!v2Data.tracked || !v2Data.tracked[pos]) {
        return null;
      }
      const trackedItem = v2Data.tracked[pos][token];
      if (!trackedItem) {
        return null;
      }
      if (typeof trackedItem === "object" && "rank" in trackedItem && Array.isArray(trackedItem.rank)) {
        return trackedItem.rank;
      }
      return null;
    }
    function getMetricTrajectoryForToken(token, pos) {
      if (trajectoryMetric === "rank") {
        return getRankTrajectoryForToken(token, pos);
      }
      return getTrajectoryForToken(token, pos);
    }
    function getGroupTrajectory(group, pos) {
      if (trajectoryMetric === "rank") {
        const result3 = data.layers.map(() => Infinity);
        let hasAnyData2 = false;
        for (const token of group.tokens) {
          const traj = getRankTrajectoryForToken(token, pos);
          if (traj) {
            hasAnyData2 = true;
            for (let j = 0; j < result3.length; j++) {
              if (traj[j] > 0 && traj[j] < result3[j]) {
                result3[j] = traj[j];
              }
            }
          }
        }
        if (!hasAnyData2) return null;
        return result3.map((v) => v === Infinity ? 0 : v);
      }
      const result2 = data.layers.map(() => 0);
      let hasAnyData = false;
      for (const token of group.tokens) {
        const traj = getTrajectoryForToken(token, pos);
        if (traj) {
          hasAnyData = true;
          for (let j = 0; j < result2.length; j++) {
            result2[j] += traj[j];
          }
        }
      }
      if (!hasAnyData) return null;
      return result2;
    }
    function getGroupProbAtLayer(group, pos, layerIdx) {
      let sum = 0;
      for (const token of group.tokens) {
        const traj = getTrajectoryForToken(token, pos);
        if (traj) {
          sum += traj[layerIdx] || 0;
        }
      }
      return sum;
    }
    function getWinningGroupAtCell(pos, layerIdx) {
      const cellData = data.cells[pos][layerIdx];
      const top1Prob = cellData.prob;
      let winningGroup = null;
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
    function findPinnedRow(pos) {
      for (let i = 0; i < state.pinnedRows.length; i++) {
        if (state.pinnedRows[i].pos === pos) return i;
      }
      return -1;
    }
    function getLineStyleForRow(pos) {
      const idx = findPinnedRow(pos);
      if (idx >= 0) return state.pinnedRows[idx].lineStyle;
      return LINE_STYLES[0];
    }
    function allPinnedGroupsBelowThreshold(pos, threshold) {
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
    function findHighestProbToken(pos, minLayer, minProb) {
      let bestToken = null;
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
    function getContainerWidth() {
      const el = dom.widget();
      const actualWidth = el?.offsetWidth || 900;
      if (state.maxTableWidth !== null) {
        return Math.min(state.maxTableWidth, actualWidth);
      }
      return actualWidth;
    }
    function getActualContainerWidth() {
      const el = dom.widget();
      return el?.offsetWidth || 900;
    }
    function probToColor(prob, baseColor) {
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
        const rVal2 = Math.round(30 + (100 - 30) * prob * 0.8);
        const gVal2 = Math.round(30 + (150 - 30) * prob * 0.6);
        const bVal = Math.round(30 + (255 - 30) * prob);
        return `rgb(${rVal2},${gVal2},${bVal})`;
      }
      const rVal = Math.round(255 * (1 - prob * 0.8));
      const gVal = Math.round(255 * (1 - prob * 0.6));
      return `rgb(${rVal},${gVal},255)`;
    }
    function computeVisibleLayers(cellWidth, containerWidth2) {
      const availableWidth = containerWidth2 - state.inputTokenWidth - 1;
      const maxCols = Math.max(1, Math.floor(availableWidth / cellWidth));
      if (maxCols >= nLayers) {
        return {
          stride: 1,
          indices: data.layers.map((_, i) => i)
        };
      }
      const stride = maxCols > 1 ? Math.max(1, Math.floor((nLayers - 1) / (maxCols - 1))) : nLayers;
      const indices = [];
      const lastLayer = nLayers - 1;
      for (let i = lastLayer; i >= 0; i -= stride) {
        indices.unshift(i);
      }
      while (indices.length > maxCols) {
        indices.shift();
      }
      return { stride, indices };
    }
    function render() {
      buildTable(
        state.currentCellWidth,
        state.currentVisibleIndices,
        state.currentMaxRows,
        state.currentStride
      );
    }
    function updateChartDimensions() {
      const table = dom.table();
      const svg2 = dom.chart();
      if (!table || !svg2) return 0;
      const tableWidth = table.offsetWidth;
      svg2.setAttribute("width", String(tableWidth));
      svg2.setAttribute("height", String(getActualChartHeight()));
      const firstInputCell = table.querySelector(".input-token");
      if (firstInputCell) {
        const tableRect = table.getBoundingClientRect();
        const inputCellRect = firstInputCell.getBoundingClientRect();
        return tableWidth - (inputCellRect.right - tableRect.left);
      }
      return tableWidth - state.inputTokenWidth;
    }
    function buildTable(cellWidth, visibleLayerIndices, maxRows, stride) {
      state.currentVisibleIndices = visibleLayerIndices;
      state.currentMaxRows = maxRows;
      if (stride !== void 0) state.currentStride = stride;
      const table = dom.table();
      if (!table) return;
      const totalTokens = data.tokens.length;
      let visiblePositions;
      if (maxRows === null || maxRows >= totalTokens) {
        visiblePositions = data.tokens.map((_, i) => i);
      } else {
        const pinnedPositions = new Set(state.pinnedRows.map((pr) => pr.pos));
        const selectedPositions = /* @__PURE__ */ new Set();
        for (const pos of pinnedPositions) {
          if (pos >= 0 && pos < totalTokens) {
            selectedPositions.add(pos);
          }
        }
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
        visiblePositions = Array.from(selectedPositions).sort((a, b) => a - b);
      }
      let html = "<colgroup>";
      html += `<col style="width:${state.inputTokenWidth}px;">`;
      visibleLayerIndices.forEach(() => {
        html += `<col style="width:${cellWidth}px;">`;
      });
      html += "</colgroup>";
      const halfwayCol = Math.floor(visibleLayerIndices.length / 2);
      function getColorForMode(mode) {
        if (mode === "top") return state.heatmapBaseColor || DEFAULT_BASE_COLOR;
        if (mode === ENTROPY_COLOR_MODE) return "#cc6622";
        const groupColor = getColorForToken(mode);
        if (groupColor) return groupColor;
        return state.heatmapNextColor || DEFAULT_NEXT_COLOR;
      }
      let maxEntropy = 0;
      const v2Data = widgetData;
      if (v2Data.entropy) {
        v2Data.entropy.forEach((layerEntropy) => {
          layerEntropy.forEach((e) => {
            if (e > maxEntropy) maxEntropy = e;
          });
        });
      }
      function getProbForMode(mode, cellData, pos, li) {
        if (mode === "top") return cellData.prob;
        if (mode === ENTROPY_COLOR_MODE) {
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
          inputStyle += isDarkMode() ? " background: #4a4a00; color: #fff;" : " background: #fff59d;";
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
            const scaledDash = rowLineStyle.dash.split(",").map((v) => parseFloat(v) * miniScale).join(",");
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
          let winningColor = null;
          let winningMode = null;
          if (state.colorModes.length > 0) {
            state.colorModes.forEach((mode) => {
              const modeProb = getProbForMode(mode, cellData, pos, li);
              const wins = winningMode === "top" ? modeProb >= cellProb : mode === "top" ? modeProb > cellProb : modeProb >= cellProb;
              if (wins) {
                cellProb = modeProb;
                winningColor = getColorForMode(mode);
                winningMode = mode;
              }
            });
          }
          const color = state.colorModes.length === 0 ? isDarkMode() ? "#1e1e1e" : "#fff" : probToColor(cellProb, winningColor);
          let textColor;
          if (isDarkMode()) {
            textColor = state.colorModes.length === 0 ? "#e0e0e0" : cellProb < 0.7 ? "#e0e0e0" : "#fff";
          } else {
            textColor = state.colorModes.length === 0 ? "#333" : cellProb < 0.5 ? "#333" : "#fff";
          }
          let pinnedColor = getColorForToken(cellData.token);
          if (!pinnedColor) {
            const winningGroup = getWinningGroupAtCell(pos, li);
            if (winningGroup) pinnedColor = winningGroup.color;
          }
          const pinnedStyle = pinnedColor ? `box-shadow: inset 0 0 0 2px ${pinnedColor};` : "";
          const isMainPrediction = rowIdx === visiblePositions.length - 1 && colIdx === visibleLayerIndices.length - 1;
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
      attachCellListeners();
      attachResizeListeners();
      const chartInnerWidth = updateChartDimensions();
      drawAllTrajectoriesWrapper(null, null, null, chartInnerWidth, state.currentHoverPos);
      updateTitle();
      updateVisibility();
      const hint = dom.resizeHint();
      if (hint) {
        const hintMain = state.currentStride > 1 ? `showing every ${state.currentStride} layers ending at ${nLayers - 1}` : `showing all ${nLayers} layers`;
        hint.innerHTML = `<span class="resize-hint-main">${hintMain}</span><span class="resize-hint-extra"> (drag column borders to adjust)</span>`;
        hint.addEventListener("mouseenter", () => {
          const extra = hint.querySelector(".resize-hint-extra");
          if (extra) extra.style.display = "inline";
          dom.widget()?.classList.add("show-all-handles");
        });
        hint.addEventListener("mouseleave", () => {
          const extra = hint.querySelector(".resize-hint-extra");
          if (extra) extra.style.display = "none";
          dom.widget()?.classList.remove("show-all-handles");
        });
      }
    }
    const chartContext = {
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
      buildTable
    };
    function drawAllTrajectoriesWrapper(hoverTraj, hoverColor, hoverLabel, width, pos) {
      drawAllTrajectories(chartContext, hoverTraj, hoverColor, hoverLabel, width, pos);
    }
    function updateTitle() {
      const titleEl = dom.title();
      if (!titleEl) return;
      if (state.maxTableWidth !== null) {
        titleEl.style.maxWidth = state.maxTableWidth + "px";
      } else {
        titleEl.style.maxWidth = "";
      }
      titleEl.style.whiteSpace = "normal";
      let displayLabel = "";
      let pinnedColor = null;
      let useColoredBy = true;
      function getLabelForMode(mode) {
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
    function startTitleEdit(e) {
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
      function finishEdit() {
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
    function updateVisibility() {
      const tableWrapper = dom.tableWrapper();
      const chartContainer = dom.chartContainer();
      if (tableWrapper) {
        tableWrapper.style.display = state.showHeatmap ? "" : "none";
      }
      if (chartContainer) {
        chartContainer.style.display = state.showChart ? "" : "none";
      }
      const resizeHint = dom.resizeHint();
      if (resizeHint) {
        resizeHint.style.display = state.showHeatmap ? "" : "none";
      }
    }
    function showColorModeMenu(e) {
      e.stopPropagation();
      closePopup();
      state.colorPickerTarget = null;
      const menu = dom.colorMenu();
      if (!menu) return;
      if (menu.classList.contains("visible")) {
        menu.classList.remove("visible");
        return;
      }
      const btn = e.target;
      const rect = btn.getBoundingClientRect();
      const containerRect = dom.widget().getBoundingClientRect();
      menu.style.left = `${rect.left - containerRect.left}px`;
      menu.style.top = `${rect.bottom - containerRect.top + 5}px`;
      const lastPos = data.tokens.length - 1;
      const lastLayerIdx = state.currentVisibleIndices[state.currentVisibleIndices.length - 1];
      const topToken = data.cells[lastPos][lastLayerIdx].token;
      const menuItems = [];
      menuItems.push({
        mode: "top",
        label: "top prediction",
        color: state.heatmapBaseColor || DEFAULT_BASE_COLOR,
        colorType: "heatmap",
        groupIdx: null
      });
      if (hasEntropyData()) {
        menuItems.push({
          mode: ENTROPY_COLOR_MODE,
          label: "entropy",
          color: "#cc6622",
          colorType: "heatmap",
          groupIdx: null
        });
      }
      if (findGroupForToken(topToken) < 0) {
        menuItems.push({
          mode: topToken,
          label: topToken,
          color: state.heatmapNextColor || DEFAULT_NEXT_COLOR,
          colorType: "heatmapNext",
          groupIdx: null
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
          borderColor: group.color
        });
      });
      let html = "";
      menuItems.forEach((item, idx) => {
        const isActive = state.colorModes.includes(item.mode);
        const borderStyle = item.borderColor ? `border-left: 3px solid ${item.borderColor};` : "";
        const checkmark = isActive ? '<span style="padding: 8px 10px 8px 20px; font-weight: bold;">\u2713</span>' : '<span style="padding: 8px 10px 8px 20px; visibility: hidden;">\u2713</span>';
        html += `<div class="color-menu-item" data-mode="${escapeHtml(item.mode)}" data-idx="${idx}" style="${borderStyle}">`;
        html += checkmark + `<span class="color-menu-label">${escapeHtml(item.label)}</span>`;
        html += `<input type="color" class="color-swatch" value="${item.color}" data-idx="${idx}" style="border:0;background:transparent;padding:0;">`;
        html += "</div>";
      });
      const noneActive = state.colorModes.length === 0;
      const noneCheckmark = noneActive ? '<span style="padding: 8px 10px 8px 20px; font-weight: bold;">\u2713</span>' : '<span style="padding: 8px 10px 8px 20px; visibility: hidden;">\u2713</span>';
      html += `<div class="color-menu-item" data-mode="none" style="border-top: 1px solid #eee; margin-top: 4px;">${noneCheckmark}<span class="color-menu-label">None</span></div>`;
      menu.innerHTML = html;
      menu.classList.add("visible");
      showOverlay(closeColorModeMenu);
      menu.querySelectorAll(".color-menu-item").forEach((item) => {
        item.addEventListener("click", (ev) => {
          const mouseEvent = ev;
          if (mouseEvent.target.classList.contains("color-swatch")) return;
          mouseEvent.stopPropagation();
          const mode = item.dataset.mode || "";
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
          item.style.animation = `menuBlink-${uid} 0.2s ease-in-out`;
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
      menu.querySelectorAll(".color-swatch").forEach((swatch) => {
        const idx = parseInt(swatch.dataset.idx || "0");
        const itemData = menuItems[idx];
        const menuItem = swatch.closest(".color-menu-item");
        swatch.addEventListener("click", (ev) => {
          ev.stopPropagation();
          if (menuItem) menuItem.classList.add("picking");
        });
        swatch.addEventListener("input", (ev) => {
          ev.stopPropagation();
          const newColor = swatch.value;
          if (itemData.colorType === "heatmap") {
            state.heatmapBaseColor = newColor;
          } else if (itemData.colorType === "heatmapNext") {
            state.heatmapNextColor = newColor;
          } else if (itemData.colorType === "trajectory" && itemData.groupIdx !== null) {
            state.pinnedGroups[itemData.groupIdx].color = newColor;
            if (menuItem) menuItem.style.borderLeftColor = newColor;
          }
          buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
        });
        swatch.addEventListener("change", () => {
          if (menuItem) menuItem.classList.remove("picking");
        });
      });
    }
    function closePopup() {
      const popup = dom.popup();
      if (popup) popup.classList.remove("visible");
      document.querySelectorAll(`#${uid} .pred-cell.selected`).forEach((c) => {
        c.classList.remove("selected");
      });
      state.openPopupCell = null;
      removeOverlay();
    }
    function closeColorModeMenu() {
      const menu = dom.colorMenu();
      if (menu) menu.classList.remove("visible");
      removeOverlay();
    }
    function showOverlay(onDismiss) {
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
    function removeOverlay() {
      const overlay = dom.overlay();
      if (overlay) overlay.remove();
    }
    function showPopup(cell, pos, li, cellData) {
      closeColorModeMenu();
      state.colorPickerTarget = null;
      state.openPopupCell = { pos, li };
      const popup = dom.popup();
      if (!popup) return;
      const rect = cell.getBoundingClientRect();
      const containerRect = dom.widget().getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const gap = 5;
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
        const ki = parseInt(item.dataset.ki || "0");
        const tokData = cellData.topk[ki];
        item.addEventListener("mouseenter", () => {
          document.querySelectorAll(`#${uid}_popup_content .topk-item`).forEach((it) => {
            it.classList.remove("active");
          });
          item.classList.add("active");
          const chartInnerWidth2 = updateChartDimensions();
          const hoverTraj2 = getMetricTrajectoryForToken(tokData.token, pos);
          drawAllTrajectoriesWrapper(hoverTraj2, "#999", tokData.token, chartInnerWidth2, pos);
        });
        item.addEventListener("mouseleave", () => {
          item.classList.remove("active");
          const chartInnerWidth2 = updateChartDimensions();
          drawAllTrajectoriesWrapper(null, null, null, chartInnerWidth2, pos);
        });
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          const addToGroup = e.shiftKey || e.ctrlKey || e.metaKey;
          togglePinnedTrajectory(tokData.token, addToGroup);
          buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
          const newCell = document.querySelector(`#${uid} .pred-cell[data-pos='${pos}'][data-li='${li}']`);
          if (newCell) {
            newCell.classList.add("selected");
            showPopup(newCell, pos, li, cellData);
          }
        });
      });
      popup.classList.add("visible");
      const popupRect = popup.getBoundingClientRect();
      if (popupRect.right > viewportWidth && rect.left - gap - popupRect.width >= 0) {
        popup.style.left = `${rect.left - containerRect.left - popupRect.width - gap}px`;
      }
      showOverlay(closePopup);
      const chartInnerWidth = updateChartDimensions();
      const hoverTraj = getMetricTrajectoryForToken(cellData.token, pos);
      drawAllTrajectoriesWrapper(hoverTraj, "#999", cellData.token, chartInnerWidth, pos);
    }
    function togglePinnedTrajectory(token, addToGroup) {
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
          const newGroup = { color: getNextColor(), tokens: [token] };
          state.pinnedGroups.push(newGroup);
          state.lastPinnedGroupIndex = state.pinnedGroups.length - 1;
          emit("pinnedGroups", JSON.parse(JSON.stringify(state.pinnedGroups)));
          return true;
        }
      }
    }
    function togglePinnedRow(pos) {
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
            const newGroup = { color: getNextColor(), tokens: [bestToken] };
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
    function attachCellListeners() {
      const table = dom.table();
      if (!table) return;
      table.querySelectorAll(".pred-cell, .input-token").forEach((cell) => {
        const pos = parseInt(cell.dataset.pos || "0", 10);
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
            const li = parseInt(cell.dataset.li || "0", 10);
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
      table.querySelectorAll(".input-token").forEach((cell) => {
        const pos = parseInt(cell.dataset.pos || "0", 10);
        if (isNaN(pos)) return;
        cell.addEventListener("click", (e) => {
          e.stopPropagation();
          closePopup();
          dom.colorMenu()?.classList.remove("visible");
          togglePinnedRow(pos);
          buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
        });
      });
      table.querySelectorAll(".pred-cell").forEach((cell) => {
        const pos = parseInt(cell.dataset.pos || "0", 10);
        const li = parseInt(cell.dataset.li || "0", 10);
        const cellData = data.cells[pos][li];
        cell.addEventListener("click", (e) => {
          e.stopPropagation();
          const mouseEvent = e;
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
          showPopup(cell, pos, li, cellData);
        });
      });
      dom.popupClose()?.addEventListener("click", closePopup);
    }
    function attachResizeListeners() {
      document.querySelectorAll(`#${uid} .resize-handle-input`).forEach((handle) => {
        handle.addEventListener("mousedown", (e) => {
          closePopup();
          const mouseEvent = e;
          state.colResizeDrag = {
            active: true,
            type: "input",
            startX: mouseEvent.clientX,
            startWidth: state.inputTokenWidth,
            colIdx: 0
          };
          handle.classList.add("dragging");
          mouseEvent.preventDefault();
          mouseEvent.stopPropagation();
        });
      });
      document.querySelectorAll(`#${uid} .resize-handle`).forEach((handle) => {
        const colIdx = parseInt(handle.dataset.col || "0", 10);
        handle.addEventListener("mousedown", (e) => {
          closePopup();
          const mouseEvent = e;
          state.colResizeDrag = {
            active: true,
            type: "cell",
            startX: mouseEvent.clientX,
            startWidth: state.currentCellWidth,
            colIdx
          };
          handle.classList.add("dragging");
          mouseEvent.preventDefault();
          mouseEvent.stopPropagation();
        });
      });
    }
    document.addEventListener("mousemove", (e) => {
      if (state.colResizeDrag.active) {
        const delta = e.clientX - state.colResizeDrag.startX;
        if (state.colResizeDrag.type === "input") {
          state.inputTokenWidth = Math.max(40, Math.min(200, state.colResizeDrag.startWidth + delta));
          const result2 = computeVisibleLayers(state.currentCellWidth, getContainerWidth());
          buildTable(state.currentCellWidth, result2.indices, state.currentMaxRows, result2.stride);
          notifyLinkedWidgets();
        } else if (state.colResizeDrag.type === "cell") {
          const numCols = state.colResizeDrag.colIdx + 1;
          const widthDelta = delta / numCols;
          const newWidth = Math.max(MIN_CELL_WIDTH, Math.min(MAX_CELL_WIDTH, state.colResizeDrag.startWidth + widthDelta));
          if (Math.abs(newWidth - state.currentCellWidth) > 1) {
            state.currentCellWidth = newWidth;
            const result2 = computeVisibleLayers(state.currentCellWidth, getContainerWidth());
            buildTable(state.currentCellWidth, result2.indices, state.currentMaxRows, result2.stride);
            notifyLinkedWidgets();
          }
        }
      }
      if (state.yAxisDrag.active) {
        const delta = e.clientX - state.yAxisDrag.startX;
        state.inputTokenWidth = Math.max(40, Math.min(200, state.yAxisDrag.startWidth + delta));
        const result2 = computeVisibleLayers(state.currentCellWidth, getContainerWidth());
        buildTable(state.currentCellWidth, result2.indices, state.currentMaxRows, result2.stride);
        notifyLinkedWidgets();
      }
      if (state.xAxisDrag.active) {
        const delta = e.clientY - state.xAxisDrag.startY;
        const newHeight = Math.max(MIN_CHART_HEIGHT, Math.min(MAX_CHART_HEIGHT, state.xAxisDrag.startHeight + delta));
        const currentHeight = getActualChartHeight();
        if (Math.abs(newHeight - currentHeight) > 2) {
          state.chartHeight = newHeight;
          const svg2 = dom.chart();
          if (svg2) svg2.setAttribute("height", String(state.chartHeight));
          const chartInnerWidth = updateChartDimensions();
          drawAllTrajectoriesWrapper(null, null, null, chartInnerWidth, state.currentHoverPos);
        }
      }
      if (state.plotMinLayerDrag.active) {
        const delta = e.clientX - state.plotMinLayerDrag.startX;
        const dr = state.plotMinLayerDrag.dotRadius;
        const uw = state.plotMinLayerDrag.usableWidth;
        const layerIdx = state.plotMinLayerDrag.layerIdx;
        let targetX = state.plotMinLayerDrag.layerXAtStart + delta;
        targetX = Math.max(dr, Math.min(uw - dr, targetX));
        const t = (targetX - dr) / (uw - 2 * dr);
        if (Math.abs(t - 1) < 1e-3) return;
        let newMinLayer = (t * (nLayers - 1) - layerIdx) / (t - 1);
        newMinLayer = Math.max(0, Math.min(layerIdx - 0.1, newMinLayer));
        if (Math.abs(newMinLayer - state.plotMinLayer) > 0.01) {
          state.plotMinLayer = newMinLayer;
          const chartInnerWidth = updateChartDimensions();
          drawAllTrajectoriesWrapper(null, null, null, chartInnerWidth, state.currentHoverPos);
        }
      }
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
              const result2 = computeVisibleLayers(state.currentCellWidth, getContainerWidth());
              buildTable(state.currentCellWidth, result2.indices, state.currentMaxRows, result2.stride);
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
          const result2 = computeVisibleLayers(state.currentCellWidth, getContainerWidth());
          buildTable(state.currentCellWidth, result2.indices, state.currentMaxRows, result2.stride);
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
    const bottomHandle = dom.resizeBottom();
    if (bottomHandle) {
      let isDragging = false;
      let startY = 0;
      let startMaxRows = null;
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
        let newMaxRows = startRows + rowDelta;
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
          startMaxTableWidth: state.maxTableWidth
        };
        rightHandle.classList.add("dragging");
        e.preventDefault();
        e.stopPropagation();
      });
    }
    dom.widget()?.addEventListener("mousedown", (e) => {
      if (e.shiftKey) e.preventDefault();
    });
    dom.widget()?.addEventListener("mouseleave", () => {
      state.currentHoverPos = data.tokens.length - 1;
      const chartInnerWidth = updateChartDimensions();
      drawAllTrajectoriesWrapper(null, null, null, chartInnerWidth, state.currentHoverPos);
    });
    function getColumnState() {
      return {
        cellWidth: state.currentCellWidth,
        inputTokenWidth: state.inputTokenWidth,
        maxTableWidth: state.maxTableWidth
      };
    }
    function setColumnState(colState, fromSync = false) {
      if (state.isSyncing) return;
      let changed = false;
      if (colState.cellWidth !== void 0 && colState.cellWidth !== state.currentCellWidth) {
        state.currentCellWidth = colState.cellWidth;
        changed = true;
      }
      if (colState.inputTokenWidth !== void 0 && colState.inputTokenWidth !== state.inputTokenWidth) {
        state.inputTokenWidth = colState.inputTokenWidth;
        changed = true;
      }
      if (colState.maxTableWidth !== void 0 && colState.maxTableWidth !== state.maxTableWidth) {
        state.maxTableWidth = colState.maxTableWidth;
        changed = true;
      }
      if (changed) {
        const result2 = computeVisibleLayers(state.currentCellWidth, getContainerWidth());
        buildTable(state.currentCellWidth, result2.indices, state.currentMaxRows, result2.stride);
        if (!fromSync) {
          notifyLinkedWidgets();
        }
      }
    }
    function notifyLinkedWidgets() {
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
    function getState() {
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
          line: pr.lineStyle.name
        })),
        heatmapBaseColor: state.heatmapBaseColor,
        heatmapNextColor: state.heatmapNextColor,
        darkMode: state.darkModeOverride,
        trajectoryMetric
      };
    }
    function applyDarkMode(enabled) {
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
    if (didAutoPinLastRow && state.pinnedGroups.length === 0) {
      const pos = nPositions - 1;
      const bestToken = findHighestProbToken(pos, 2, 0.05);
      if (bestToken && findGroupForToken(bestToken) < 0) {
        const newGroup = { color: getNextColor(), tokens: [bestToken] };
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
      attributeFilter: ["style", "class"]
    });
    if (document.body) {
      styleObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["style", "class"]
      });
    }
    const publicInterface = {
      uid,
      getState,
      getColumnState,
      setColumnState,
      linkColumnsTo(otherWidget) {
        if (!state.linkedWidgets.includes(otherWidget)) {
          state.linkedWidgets.push(otherWidget);
        }
        const otherLinked = otherWidget._getLinkedWidgets ? otherWidget._getLinkedWidgets() : [];
        if (!otherLinked.includes(publicInterface)) {
          otherWidget.linkColumnsTo(publicInterface);
        }
        otherWidget.setColumnState(getColumnState(), true);
      },
      unlinkColumns(otherWidget) {
        const idx = state.linkedWidgets.indexOf(otherWidget);
        if (idx >= 0) {
          state.linkedWidgets.splice(idx, 1);
        }
      },
      _getLinkedWidgets() {
        return state.linkedWidgets;
      },
      setDarkMode(enabled) {
        state.darkModeOverride = enabled === null ? null : !!enabled;
        applyDarkMode(isDarkMode());
        buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows, state.currentStride);
      },
      getDarkMode() {
        return isDarkMode();
      },
      setFontSize(options) {
        const widgetEl = dom.widget();
        if (!widgetEl) return;
        if (options === null || !options.title && !options.content) {
          widgetEl.style.removeProperty("--ll-title-size");
          widgetEl.style.removeProperty("--ll-content-size");
        } else {
          if (options.title) widgetEl.style.setProperty("--ll-title-size", options.title);
          if (options.content) widgetEl.style.setProperty("--ll-content-size", options.content);
        }
        buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows, state.currentStride);
      },
      getFontSize() {
        const widgetEl = dom.widget();
        if (!widgetEl) return { title: "14px", content: "14px" };
        const computedStyle = getComputedStyle(widgetEl);
        return {
          title: computedStyle.getPropertyValue("--ll-title-size").trim() || "14px",
          content: computedStyle.getPropertyValue("--ll-content-size").trim() || "14px"
        };
      },
      // Row and group manipulation
      togglePinnedRow(pos) {
        const result2 = togglePinnedRow(pos);
        buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
        return result2;
      },
      togglePinnedTrajectory(token, addToGroup = false) {
        const result2 = togglePinnedTrajectory(token, addToGroup);
        buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
        return result2;
      },
      getPinnedRows() {
        return getSerializedPinnedRows();
      },
      getPinnedGroups() {
        return JSON.parse(JSON.stringify(state.pinnedGroups));
      },
      // Event system
      on,
      off,
      // Title management
      setTitle(title) {
        state.customTitle = title;
        updateTitle();
      },
      getTitle() {
        return state.customTitle;
      },
      // Metric mode API for trajectories
      setTrajectoryMetric(metric) {
        if (metric === "rank" && !hasRankData()) {
          console.warn("No rank data available; keeping current metric");
          return;
        }
        trajectoryMetric = metric;
        buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows, state.currentStride);
      },
      getTrajectoryMetric() {
        return trajectoryMetric;
      },
      // Color mode API for heatmap
      setColorModes(modes) {
        state.colorModes = modes.slice();
        buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows, state.currentStride);
      },
      getColorModes() {
        return state.colorModes.slice();
      },
      addColorMode(mode) {
        if (!state.colorModes.includes(mode)) {
          state.colorModes.push(mode);
          buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows, state.currentStride);
        }
      },
      removeColorMode(mode) {
        const idx = state.colorModes.indexOf(mode);
        if (idx !== -1) {
          state.colorModes.splice(idx, 1);
          buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows, state.currentStride);
        }
      },
      // Data availability checks
      hasRankData() {
        return hasRankData();
      },
      hasEntropyData() {
        return hasEntropyData();
      },
      // Visibility toggles
      setShowHeatmap(show) {
        state.showHeatmap = show;
        updateVisibility();
      },
      getShowHeatmap() {
        return state.showHeatmap;
      },
      setShowChart(show) {
        state.showChart = show;
        updateVisibility();
      },
      getShowChart() {
        return state.showChart;
      },
      // Hover API for external synchronization
      hoverRow(pos) {
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
        const table = dom.table();
        if (table) {
          table.querySelectorAll("tr").forEach((row2) => {
            row2.classList.remove("external-hover");
          });
          const row = table.querySelector(`tr:has(.input-token[data-pos="${pos}"])`);
          if (row) {
            row.classList.add("external-hover");
          }
        }
      },
      clearHover() {
        state.currentHoverPos = nPositions - 1;
        const chartInnerWidth = updateChartDimensions();
        drawAllTrajectoriesWrapper(null, null, null, chartInnerWidth, state.currentHoverPos);
        const table = dom.table();
        if (table) {
          table.querySelectorAll("tr.external-hover").forEach((row) => {
            row.classList.remove("external-hover");
          });
        }
      },
      getHoveredRow() {
        return state.currentHoverPos;
      }
    };
    return publicInterface;
  }
  var index_default = LogitLensWidget;
  if (typeof window !== "undefined") {
    window.LogitLensWidget = LogitLensWidget;
  }
  return __toCommonJS(index_exports);
})();
window.LogitLensWidget = LogitLensWidgetModule.LogitLensWidget;
