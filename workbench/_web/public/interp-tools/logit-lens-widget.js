/**
 * LogitLensWidget - Interactive visualization of transformer logit lens data
 *
 * DATA MODEL
 * ==========
 *
 * Input data (widgetData after normalization):
 * {
 *   layers: number[],           // Layer indices [0, 1, 2, ...]
 *   tokens: string[],           // Input tokens ["The", " capital", ...]
 *   cells: [                    // [position][layer]
 *     [{ token, prob, trajectory, topk }, ...]
 *   ],
 *   meta: { model, version }
 * }
 *
 * Cell data structure:
 * {
 *   token: string,              // Top predicted token at this position/layer
 *   prob: number,               // Probability of top token (0-1)
 *   trajectory: number[],       // Probability of this token across all layers
 *   topk: [                     // Top-k predictions at this cell
 *     { token: string, prob: number }, ...
 *   ]
 * }
 *
 * Pinned trajectory group:
 * {
 *   tokens: string[],           // Tokens in this group (usually 1)
 *   color: string,              // Hex color like "#ff6600"
 *   lineStyle: { name, dash }   // Line style for chart
 * }
 *
 * Pinned row:
 * {
 *   pos: number,                // Token position (row index)
 *   lineStyle: { name, dash }   // Line style for this row's trajectories
 * }
 *
 * UI State (serializable via getState/setState):
 * {
 *   chartHeight, inputTokenWidth, cellWidth, maxRows, maxTableWidth,
 *   plotMinLayer, colorModes, title, colorIndex, pinnedGroups,
 *   lastPinnedGroupIndex, pinnedRows, heatmapBaseColor, heatmapNextColor,
 *   darkMode
 * }
 */

var LogitLensWidget = (function() {
    // Generate a random ID for each widget instance to ensure uniqueness
    // even when the widget code is loaded multiple times (e.g., in Jupyter notebooks
    // where each cell output has its own copy of the code)
    function generateUid() {
        // Use crypto.randomUUID if available, otherwise fall back to Math.random
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return "ll_" + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
        }
        // Fallback: combine timestamp and random number
        return "ll_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    // ═══════════════════════════════════════════════════════════════
    // DATA NORMALIZATION
    // ═══════════════════════════════════════════════════════════════
    // Normalize data from compact format (v2) to internal format
    // Returns { normalized: v1Data, v2Data: originalV2OrNull }
    function normalizeData(data) {
        // Already in v1 format (has cells)
        if (data.cells) {
            // Just ensure 'tokens' exists (might be 'input' in hybrid)
            if (!data.tokens && data.input) {
                data.tokens = data.input;
            }
            return { normalized: data, v2Data: null };
        }

        // V2 compact format: convert to v1
        var nLayers = data.layers.length;
        var nPositions = data.input.length;
        var cells = [];

        for (var pos = 0; pos < nPositions; pos++) {
            var posData = [];
            var trackedAtPos = data.tracked[pos];

            for (var li = 0; li < nLayers; li++) {
                var topkTokens = data.topk[li][pos];
                var topkList = [];

                for (var ki = 0; ki < topkTokens.length; ki++) {
                    var tok = topkTokens[ki];
                    var trajectory = trackedAtPos[tok] || [];
                    var prob = trajectory[li] || 0;
                    topkList.push({
                        token: tok,
                        prob: prob,
                        trajectory: trajectory
                    });
                }

                // Top-1 is first in topk
                var top1 = topkList[0] || { token: "", prob: 0, trajectory: [] };
                posData.push({
                    token: top1.token,
                    prob: top1.prob,
                    trajectory: top1.trajectory,
                    topk: topkList
                });
            }
            cells.push(posData);
        }

        var normalized = {
            layers: data.layers,
            tokens: data.input,
            cells: cells,
            meta: data.meta || {}
        };

        // Keep reference to v2 data for entropy access
        return { normalized: normalized, v2Data: data };
    }

    return function(containerArg, inputData, uiState) {
        var uid = generateUid();
        var container;
        if (typeof containerArg === 'string') {
            container = document.querySelector(containerArg);
        } else if (containerArg instanceof Element) {
            container = containerArg;
        }
        if (!container) {
            console.error("Container not found:", containerArg);
            return;
        }

        // Normalize data format (convert v2 compact to v1 internal)
        var dataResult = normalizeData(inputData);
        var widgetData = dataResult.normalized;
        var v2Data = dataResult.v2Data;  // Keep v2 data for entropy access

        // Inject scoped CSS
        var style = document.createElement("style");
        style.textContent = `
            #${uid} {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                margin: 20px 0;
                padding: 0;
                position: relative;
                -webkit-user-select: none;
                user-select: none;
            }
            #${uid} .ll-title { font-size: var(--ll-title-size, 20px); font-weight: 600; margin-bottom: 8px; padding: 2px 0; }
            #${uid} .color-mode-btn {
                display: inline-block; padding: 0; background: white;
                border-radius: 4px; font-size: var(--ll-title-size, 20px); cursor: pointer; color: #333;
                border: none;
            }
            #${uid} .color-mode-btn:hover { background: #f5f5f5; }
            #${uid} .ll-table { border-collapse: collapse; font-size: var(--ll-content-size, 14px); table-layout: fixed; }
            #${uid} .ll-table td, #${uid} .ll-table th { border: 1px solid #ddd; box-sizing: border-box; }
            #${uid} .pred-cell {
                height: 22px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                padding: 2px 4px; font-family: monospace; font-size: calc(var(--ll-content-size, 14px) * 0.9); cursor: pointer; position: relative;
            }
            #${uid} .pred-cell:hover { outline: 2px solid #e91e63; outline-offset: -1px; }
            #${uid} .pred-cell.selected { background: #fff59d !important; color: #333 !important; }
            #${uid} .input-token {
                padding: 2px 8px; text-align: right; font-weight: 500; color: #333;
                background: #f5f5f5; white-space: nowrap; overflow: hidden;
                text-overflow: ellipsis; font-family: monospace; font-size: var(--ll-content-size, 14px); cursor: pointer;
                position: relative;
            }
            #${uid} .input-token:hover { background: #e8e8e8; }
            #${uid} tr:has(.input-token:hover) { outline: 2px solid rgba(255, 193, 7, 0.8); outline-offset: -1px; }
            #${uid} tr:has(.input-token:hover) .input-token { background: #fff59d !important; }
            #${uid} .layer-hdr {
                padding: 4px 2px; text-align: center; font-weight: 500; color: #666;
                background: #f5f5f5; font-size: calc(var(--ll-content-size, 14px) * 0.9); position: relative;
            }
            #${uid} .corner-hdr { padding: 4px 8px; text-align: right; font-weight: 500; color: #666; background: white; position: relative; }
            #${uid} .chart-container { margin-top: 8px; background: #fafafa; border-radius: 4px; padding: 8px 0; }
            #${uid} .chart-container svg { display: block; margin: 0; padding: 0; }
            #${uid} .popup {
                display: none; position: absolute; background: white; border: 1px solid #ddd;
                border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); padding: 12px;
                z-index: 100; min-width: 180px; max-width: 280px;
            }
            #${uid} .popup.visible { display: block; }
            #${uid} .popup-header { font-weight: 600; font-size: min(var(--ll-title-size, 20px), calc((var(--ll-content-size, 14px) + var(--ll-title-size, 20px)) / 2)); margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #eee; }
            #${uid} .popup-header code { font-weight: 400; font-size: min(var(--ll-title-size, 20px), calc((var(--ll-content-size, 14px) + var(--ll-title-size, 20px)) / 2)); background: #f5f5f5; padding: 2px 6px; border-radius: 3px; margin-left: 4px; }
            #${uid} .popup-close { position: absolute; top: 8px; right: 10px; cursor: pointer; color: #999; font-size: var(--ll-title-size, 20px); }
            #${uid} .popup-close:hover { color: #333; }
            #${uid} .topk-item {
                padding: 4px 6px; margin: 2px 0; border-radius: 3px; cursor: pointer;
                display: flex; justify-content: space-between;
                font-size: min(var(--ll-title-size, 20px), calc((var(--ll-content-size, 14px) + var(--ll-title-size, 20px)) / 2));
            }
            #${uid} .topk-item:hover { background: #f0f0f0; }
            #${uid} .topk-item.active { background: #f0f0f0; }
            #${uid} .topk-token { font-family: monospace; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
            #${uid} .color-menu-item { padding: 0; cursor: pointer; font-size: min(var(--ll-title-size, 20px), calc((var(--ll-content-size, 14px) + var(--ll-title-size, 20px)) / 2)); display: flex; align-items: stretch; }
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
            #${uid}.dark-mode .color-mode-btn { background: #2d2d2d; color: #e0e0e0; }
            #${uid}.dark-mode .color-mode-btn:hover { background: #3d3d3d; }
            #${uid}.dark-mode .ll-table td, #${uid}.dark-mode .ll-table th { border-color: #444; }
            #${uid}.dark-mode .pred-cell { color: #e0e0e0; }
            #${uid}.dark-mode .pred-cell.selected { background: #4a4a00 !important; color: #fff !important; }
            #${uid}.dark-mode .input-token { background: #2d2d2d; color: #e0e0e0; }
            #${uid}.dark-mode .input-token:hover { background: #3d3d3d; }
            #${uid}.dark-mode tr:has(.input-token:hover) .input-token { background: #4a4a00 !important; color: #fff !important; }
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
        document.head.appendChild(style);

        // Inject HTML structure
        container.innerHTML = `
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

        // Widget logic (same as original, just using uid and widgetData)
        var widgetInterface = (function() {
            // ═══════════════════════════════════════════════════════════════
            // CONSTANTS (derived from data, do not change after initialization)
            // ═══════════════════════════════════════════════════════════════
            var nLayers = widgetData.layers.length;
            var nPositions = widgetData.tokens.length;
            var defaultNextToken = widgetData.cells[nPositions - 1][nLayers - 1].token;

            // Compute max entropy for normalization (if entropy data available)
            var maxEntropy = 0;
            if (v2Data && v2Data.entropy) {
                for (var li = 0; li < v2Data.entropy.length; li++) {
                    for (var pos = 0; pos < v2Data.entropy[li].length; pos++) {
                        if (v2Data.entropy[li][pos] > maxEntropy) {
                            maxEntropy = v2Data.entropy[li][pos];
                        }
                    }
                }
            }
            // Use at least 1.0 to avoid division issues with very low entropy data
            maxEntropy = Math.max(maxEntropy, 1.0);

            // ═══════════════════════════════════════════════════════════════
            // CONFIGURATION (fixed limits and palettes)
            // ═══════════════════════════════════════════════════════════════
            var minChartHeight = 60;
            var maxChartHeight = 400;
            var minCellWidth = 10;
            var maxCellWidth = 200;
            var colors = ["#2196F3", "#e91e63", "#4CAF50", "#FF9800", "#9C27B0", "#00BCD4", "#F44336", "#8BC34A"];
            var lineStyles = [
                { dash: "", name: "solid" },
                { dash: "8,4", name: "dashed" },
                { dash: "2,3", name: "dotted" },
                { dash: "8,4,2,4", name: "dash-dot" }
            ];

            // ═══════════════════════════════════════════════════════════════
            // STATE (all mutable widget state in one place)
            // ═══════════════════════════════════════════════════════════════
            var state = {
                // Layout dimensions (null = use default/auto)
                chartHeight: (uiState && uiState.chartHeight) || null,
                inputTokenWidth: (uiState && uiState.inputTokenWidth) || 100,
                currentCellWidth: (uiState && uiState.cellWidth) || 44,
                currentMaxRows: (uiState && uiState.maxRows !== undefined) ? uiState.maxRows : null,
                maxTableWidth: (uiState && uiState.maxTableWidth !== undefined) ? uiState.maxTableWidth : null,
                plotMinLayer: Math.max(0, Math.min(nLayers - 2, (uiState && uiState.plotMinLayer !== undefined) ? uiState.plotMinLayer : 0)),

                // Computed layout (updated by computeVisibleLayers)
                currentVisibleIndices: [],
                currentStride: 1,

                // Interaction state
                openPopupCell: null,
                currentHoverPos: nPositions - 1,
                colorPickerTarget: null,

                // Pinned trajectories
                pinnedGroups: (uiState && uiState.pinnedGroups) ? JSON.parse(JSON.stringify(uiState.pinnedGroups)) : [],
                pinnedRows: [],  // populated below from uiState
                lastPinnedGroupIndex: (uiState && uiState.lastPinnedGroupIndex !== undefined) ? uiState.lastPinnedGroupIndex : -1,

                // Color settings
                colorModes: (uiState && uiState.colorModes) ? uiState.colorModes.slice() :
                            (uiState && uiState.colorMode && uiState.colorMode !== "none") ? [uiState.colorMode] :
                            (uiState && uiState.colorMode === "none") ? [] : ["top", defaultNextToken],
                colorIndex: (uiState && uiState.colorIndex) || 0,
                heatmapBaseColor: (uiState && uiState.heatmapBaseColor) || null,
                heatmapNextColor: (uiState && uiState.heatmapNextColor) || null,

                // Display settings
                customTitle: (uiState && uiState.title) || "Logit Lens: Top Predictions by Layer",
                darkModeOverride: (uiState && uiState.darkMode !== undefined) ? uiState.darkMode : null,

                // Visibility toggles (new features)
                showHeatmap: (uiState && uiState.showHeatmap !== undefined) ? uiState.showHeatmap : true,
                showChart: (uiState && uiState.showChart !== undefined) ? uiState.showChart : true,

                // Trajectory metric mode: "probability" or "rank"
                trajectoryMetric: (uiState && uiState.trajectoryMetric) || "probability",

                // Event listeners for external integration
                eventListeners: {},

                // Widget linking
                linkedWidgets: [],
                isSyncing: false,

                // Drag interaction state
                colResizeDrag: { active: false, type: null, startX: 0, startWidth: 0, colIdx: 0 },
                yAxisDrag: { active: false, startX: 0, startWidth: 0 },
                xAxisDrag: { active: false, startY: 0, startHeight: 0 },
                plotMinLayerDrag: { active: false, startX: 0, startMinLayer: 0, layerIdx: 0, layerXAtStart: 0, usableWidth: 0, dotRadius: 0 },
                rightEdgeDrag: { active: false, startX: 0, startTableWidth: 0, hadMaxTableWidth: false, startMaxTableWidth: null },
            };

            // Restore pinned rows from uiState, mapping lineStyle names back to objects
            if (uiState && uiState.pinnedRows !== undefined) {
                // Explicit pinnedRows provided (even if empty) - use it
                state.pinnedRows = uiState.pinnedRows.map(function(pr) {
                    var style = lineStyles.find(function(ls) { return ls.name === pr.line; }) || lineStyles[0];
                    return { pos: pr.pos, lineStyle: style };
                });
            } else {
                // No pinnedRows specified - auto-pin the last row by default
                state.pinnedRows = [{ pos: nPositions - 1, lineStyle: lineStyles[0] }];
            }

            // ═══════════════════════════════════════════════════════════════
            // DOM HELPERS (centralized element access)
            // ═══════════════════════════════════════════════════════════════
            var dom = {
                widget: function() { return document.getElementById(uid); },
                table: function() { return document.getElementById(uid + "_table"); },
                chart: function() { return document.getElementById(uid + "_chart"); },
                popup: function() { return document.getElementById(uid + "_popup"); },
                popupClose: function() { return document.getElementById(uid + "_popup_close"); },
                popupLayer: function() { return document.getElementById(uid + "_popup_layer"); },
                popupPos: function() { return document.getElementById(uid + "_popup_pos"); },
                popupContent: function() { return document.getElementById(uid + "_popup_content"); },
                colorMenu: function() { return document.getElementById(uid + "_color_menu"); },
                colorBtn: function() { return document.getElementById(uid + "_color_btn"); },
                colorPicker: function() { return document.getElementById(uid + "_color_picker"); },
                title: function() { return document.getElementById(uid + "_title"); },
                titleText: function() { return document.getElementById(uid + "_title_text"); },
                overlay: function() { return document.getElementById(uid + "_overlay"); },
                resizeHint: function() { return document.getElementById(uid + "_resize_hint"); },
                resizeBottom: function() { return document.getElementById(uid + "_resize_bottom"); },
                resizeRight: function() { return document.getElementById(uid + "_resize_right"); },
                chartContainer: function() { return document.getElementById(uid + "_chart_container"); },
                tableWrapper: function() { return document.querySelector("#" + uid + " .table-wrapper"); }
            };

            // ═══════════════════════════════════════════════════════════════
            // EVENT EMITTER
            // ═══════════════════════════════════════════════════════════════
            function emitEvent(eventName, data) {
                var listeners = state.eventListeners[eventName];
                if (!listeners) return;
                for (var i = 0; i < listeners.length; i++) {
                    try {
                        listeners[i](data);
                    } catch (e) {
                        console.error("Event listener error:", e);
                    }
                }
            }

            function addEventListener(eventName, callback) {
                if (!state.eventListeners[eventName]) {
                    state.eventListeners[eventName] = [];
                }
                state.eventListeners[eventName].push(callback);
            }

            function removeEventListener(eventName, callback) {
                var listeners = state.eventListeners[eventName];
                if (!listeners) return;
                var idx = listeners.indexOf(callback);
                if (idx >= 0) {
                    listeners.splice(idx, 1);
                }
            }

            // ═══════════════════════════════════════════════════════════════
            // DATA CAPABILITY DETECTION
            // ═══════════════════════════════════════════════════════════════
            function hasEntropyData() {
                return v2Data && Array.isArray(v2Data.entropy) && v2Data.entropy.length > 0;
            }

            function hasRankData() {
                // Check if any tracked token has rank data
                // V2 format stores rank in tracked[pos][token].rank array
                if (!v2Data || !v2Data.tracked) return false;
                for (var pos = 0; pos < v2Data.tracked.length; pos++) {
                    var trackedAtPos = v2Data.tracked[pos];
                    for (var token in trackedAtPos) {
                        var data = trackedAtPos[token];
                        if (data && typeof data === "object" && Array.isArray(data.rank)) {
                            return true;
                        }
                    }
                }
                return false;
            }

            // ═══════════════════════════════════════════════════════════════
            // HELPER FUNCTIONS
            // ═══════════════════════════════════════════════════════════════
            // Helper to get content font size in pixels (parses CSS variable)
            function getContentFontSizePx() {
                var widgetEl = dom.widget();
                if (!widgetEl) return 14;
                var style = getComputedStyle(widgetEl);
                var sizeStr = style.getPropertyValue('--ll-content-size').trim() || '14px';
                var match = sizeStr.match(/^([\d.]+)px$/);
                return match ? parseFloat(match[1]) : 14;
            }
            // Default chart height scales with row height (or font size as fallback)
            function getDefaultChartHeight() {
                var fontSize = getContentFontSizePx();
                var topMargin = Math.max(10, fontSize * 1.2);
                var bottomMargin = Math.max(25, fontSize * 1.5);
                // Try to measure actual row height from table
                var table = dom.table();
                var rowHeight = fontSize * 2;  // fallback estimate
                if (table) {
                    var rows = table.querySelectorAll("tr");
                    if (rows.length >= 2) {
                        rowHeight = rows[1].getBoundingClientRect().height || rowHeight;
                    }
                }
                // Chart inner area = ~6 table rows worth of height
                var innerHeight = rowHeight * 6;
                return topMargin + innerHeight + bottomMargin;
            }
            // Get actual chart height (use default if not explicitly set)
            function getActualChartHeight() {
                return state.chartHeight !== null ? state.chartHeight : getDefaultChartHeight();
            }
            // Dynamic margins that scale with font size
            function getChartMargin() {
                var fontSize = getContentFontSizePx();
                return {
                    top: Math.max(10, fontSize * 1.2),    // Space for y-axis top label (ascenders)
                    right: 8,
                    bottom: Math.max(25, fontSize * 1.5), // Space for x-axis tick labels + descenders
                    left: 10
                };
            }
            function getChartInnerHeight() {
                var m = getChartMargin();
                return getActualChartHeight() - m.top - m.bottom;
            }
            var minCellWidth = 10;
            var maxCellWidth = 200;

            // Get effective dark mode state (checks override, falls back to CSS detection)
            function isDarkMode() {
                if (state.darkModeOverride !== null) {
                    return state.darkModeOverride;
                }
                // Auto-detect from CSS color-scheme on container or ancestors
                return getComputedStyle(container).colorScheme === 'dark';
            }

            function getNextColor() {
                var c = colors[state.colorIndex % colors.length];
                state.colorIndex++;
                return c;
            }

            function getColorForToken(token) {
                for (var i = 0; i < state.pinnedGroups.length; i++) {
                    if (state.pinnedGroups[i].tokens.indexOf(token) >= 0) return state.pinnedGroups[i].color;
                }
                return null;
            }

            function findGroupForToken(token) {
                for (var i = 0; i < state.pinnedGroups.length; i++) {
                    if (state.pinnedGroups[i].tokens.indexOf(token) >= 0) return i;
                }
                return -1;
            }

            function getGroupLabel(group) {
                return group.tokens.map(function(t) { return visualizeSpaces(t); }).join("+");
            }

            function getGroupTrajectory(group, pos) {
                // For rank mode, return rank trajectory (min rank = best among group)
                if (state.trajectoryMetric === "rank") {
                    var result = widgetData.layers.map(function() { return null; });
                    var hasAnyData = false;
                    for (var i = 0; i < group.tokens.length; i++) {
                        var rankTraj = getRankTrajectoryForToken(group.tokens[i], pos);
                        if (rankTraj !== null) {
                            hasAnyData = true;
                            for (var j = 0; j < result.length; j++) {
                                if (rankTraj[j] !== null) {
                                    // Take minimum rank (best rank among group tokens)
                                    if (result[j] === null || rankTraj[j] < result[j]) {
                                        result[j] = rankTraj[j];
                                    }
                                }
                            }
                        }
                    }
                    return hasAnyData ? result : null;
                }

                // Default: probability trajectory (sum of probabilities)
                var result = widgetData.layers.map(function() { return 0; });
                var hasAnyData = false;
                for (var i = 0; i < group.tokens.length; i++) {
                    var traj = getTrajectoryForToken(group.tokens[i], pos);
                    if (traj !== null) {
                        hasAnyData = true;
                        for (var j = 0; j < result.length; j++) {
                            result[j] += traj[j];
                        }
                    }
                }
                return hasAnyData ? result : null;
            }

            function getGroupProbAtLayer(group, pos, layerIdx) {
                var sum = 0;
                for (var i = 0; i < group.tokens.length; i++) {
                    var traj = getTrajectoryForToken(group.tokens[i], pos);
                    if (traj !== null) {
                        sum += traj[layerIdx] || 0;
                    }
                }
                return sum;
            }

            function getWinningGroupAtCell(pos, layerIdx) {
                var cellData = widgetData.cells[pos][layerIdx];
                var top1Prob = cellData.prob;
                var winningGroup = null;
                var winningProb = top1Prob;

                for (var i = 0; i < state.pinnedGroups.length; i++) {
                    var groupProb = getGroupProbAtLayer(state.pinnedGroups[i], pos, layerIdx);
                    if (groupProb > winningProb) {
                        winningProb = groupProb;
                        winningGroup = state.pinnedGroups[i];
                    }
                }
                return winningGroup;
            }

            function findPinnedRow(pos) {
                for (var i = 0; i < state.pinnedRows.length; i++) {
                    if (state.pinnedRows[i].pos === pos) return i;
                }
                return -1;
            }

            function getLineStyleForRow(pos) {
                var idx = findPinnedRow(pos);
                if (idx >= 0) return state.pinnedRows[idx].lineStyle;
                return lineStyles[0];  // default solid
            }

            function allPinnedGroupsBelowThreshold(pos, threshold) {
                // Check if all pinned groups have max prob < threshold at this position
                if (state.pinnedGroups.length === 0) return true;
                for (var i = 0; i < state.pinnedGroups.length; i++) {
                    var traj = getGroupTrajectory(state.pinnedGroups[i], pos);
                    if (traj !== null) {
                        var maxProb = Math.max.apply(null, traj);
                        if (maxProb >= threshold) return false;
                    }
                }
                return true;
            }

            function findHighestProbToken(pos, minLayer, minProb) {
                // Find the token that achieves highest probability at this position
                // considering only layers >= minLayer, and only if max prob >= minProb
                var bestToken = null;
                var bestProb = 0;

                // Look through all cells at this position
                for (var li = minLayer; li < widgetData.cells[pos].length; li++) {
                    var cellData = widgetData.cells[pos][li];
                    // Check top-1 token
                    if (cellData.prob > bestProb) {
                        bestProb = cellData.prob;
                        bestToken = cellData.token;
                    }
                    // Also check topk
                    for (var ki = 0; ki < cellData.topk.length; ki++) {
                        if (cellData.topk[ki].prob > bestProb) {
                            bestProb = cellData.topk[ki].prob;
                            bestToken = cellData.topk[ki].token;
                        }
                    }
                }

                if (bestProb >= minProb) return bestToken;
                return null;
            }

            function togglePinnedRow(pos) {
                var idx = findPinnedRow(pos);
                if (idx >= 0) {
                    // Unpin the row
                    state.pinnedRows.splice(idx, 1);
                    return false;
                } else {
                    // Check if we should auto-pin a token
                    if (allPinnedGroupsBelowThreshold(pos, 0.01)) {
                        var bestToken = findHighestProbToken(pos, 2, 0.05);
                        if (bestToken && findGroupForToken(bestToken) < 0) {
                            // Pin this token
                            var newGroup = { color: getNextColor(), tokens: [bestToken] };
                            state.pinnedGroups.push(newGroup);
                            state.lastPinnedGroupIndex = state.pinnedGroups.length - 1;
                        }
                    }
                    // Pin the row with next available line style
                    var styleIdx = state.pinnedRows.length % lineStyles.length;
                    state.pinnedRows.push({ pos: pos, lineStyle: lineStyles[styleIdx] });
                    return true;
                }
            }

            // ═══════════════════════════════════════════════════════════════
            // UTILITY FUNCTIONS
            // ═══════════════════════════════════════════════════════════════

            function escapeHtml(text) {
                var div = document.createElement("div");
                div.textContent = text;
                return div.innerHTML;
            }

            // Round probability to a nice value for chart y-axis scale
            function niceMax(p) {
                if (p >= 0.95) return 1.0;
                var niceValues = [0.003, 0.005, 0.01, 0.02, 0.03, 0.05, 0.1, 0.2, 0.3, 0.5, 1.0];
                for (var i = 0; i < niceValues.length; i++) {
                    if (p <= niceValues[i]) return niceValues[i];
                }
                return 1.0;
            }

            // Format probability as percentage string with minimal digits
            function formatPct(p) {
                var pct = p * 100;
                if (pct >= 1) return Math.round(pct) + "%";
                if (pct >= 0.1) return pct.toFixed(1) + "%";
                return pct.toFixed(2) + "%";
            }

            function normalizeForComparison(token) {
                // Remove spaces and punctuation, lowercase
                return token.replace(/[\s.,!?;:'"()\[\]{}\-_]/g, '').toLowerCase();
            }

            function hasSimilarTokensInList(topkList, targetToken) {
                var targetNorm = normalizeForComparison(targetToken);
                if (!targetNorm) return false;  // nothing left after normalization

                for (var i = 0; i < topkList.length; i++) {
                    if (topkList[i].token === targetToken) continue;  // skip the target itself
                    var otherNorm = normalizeForComparison(topkList[i].token);
                    if (otherNorm && otherNorm === targetNorm) {
                        return true;
                    }
                }
                return false;
            }

            // Map of invisible/special characters to their entity names
            // Note: regular space and modifier letter shelf are NOT here - spaces get visualized as shelf
            var invisibleEntityMap = {
                '\u00A0': '&nbsp;',      // Non-breaking space
                '\u00AD': '&shy;',       // Soft hyphen
                '\u200B': '&#8203;',     // Zero-width space
                '\u200C': '&zwnj;',      // Zero-width non-joiner
                '\u200D': '&zwj;',       // Zero-width joiner
                '\uFEFF': '&#65279;',    // Zero-width no-break space (BOM)
                '\u2060': '&#8288;',     // Word joiner
                '\u2002': '&ensp;',      // En space
                '\u2003': '&emsp;',      // Em space
                '\u2009': '&thinsp;',    // Thin space
                '\u200A': '&#8202;',     // Hair space
                '\u2006': '&#8198;',     // Six-per-em space
                '\u2008': '&#8200;',     // Punctuation space
                '\u200E': '&lrm;',       // Left-to-right mark
                '\u200F': '&rlm;',       // Right-to-left mark
                '\t': '&#9;',            // Tab
                '\n': '&#10;',           // Newline
                '\r': '&#13;'            // Carriage return
            };

            function visualizeSpaces(text, spellOutEntities) {
                var result = text;

                // If spellOutEntities is true, convert invisible chars to entity names FIRST
                if (spellOutEntities) {
                    var output = '';
                    for (var i = 0; i < result.length; i++) {
                        var ch = result[i];
                        if (invisibleEntityMap[ch]) {
                            output += invisibleEntityMap[ch];
                        } else {
                            output += ch;
                        }
                    }
                    result = output;
                }

                // Then convert leading/trailing spaces to modifier letter shelf
                var leadingSpaces = 0;
                while (leadingSpaces < result.length && result[leadingSpaces] === ' ') leadingSpaces++;
                if (leadingSpaces > 0) {
                    result = '\u02FD'.repeat(leadingSpaces) + result.slice(leadingSpaces);
                }
                var trailingSpaces = 0;
                while (trailingSpaces < result.length && result[result.length - 1 - trailingSpaces] === ' ') trailingSpaces++;
                if (trailingSpaces > 0) {
                    result = result.slice(0, result.length - trailingSpaces) + '\u02FD'.repeat(trailingSpaces);
                }

                return result;
            }

            // ═══════════════════════════════════════════════════════════════
            // COLOR MANAGEMENT
            // ═══════════════════════════════════════════════════════════════

            function probToColor(prob, baseColor) {
                if (baseColor) {
                    var hex = baseColor.replace('#', '');
                    var r = parseInt(hex.substr(0, 2), 16);
                    var g = parseInt(hex.substr(2, 2), 16);
                    var b = parseInt(hex.substr(4, 2), 16);
                    var blend = prob;

                    if (isDarkMode()) {
                        // Dark mode: blend from dark background (#1e1e1e = 30,30,30) to glowing color
                        var darkBase = 30;
                        var rr = Math.round(darkBase + (r - darkBase) * blend);
                        var gg = Math.round(darkBase + (g - darkBase) * blend);
                        var bb = Math.round(darkBase + (b - darkBase) * blend);
                        return "rgb(" + rr + "," + gg + "," + bb + ")";
                    } else {
                        // Light mode: blend from white to color
                        var rr = Math.round(255 - (255 - r) * blend);
                        var gg = Math.round(255 - (255 - g) * blend);
                        var bb = Math.round(255 - (255 - b) * blend);
                        return "rgb(" + rr + "," + gg + "," + bb + ")";
                    }
                }
                // Default gradient (no baseColor specified)
                if (isDarkMode()) {
                    // Dark mode: glow from dark to blue
                    var rVal = Math.round(30 + (100 - 30) * prob * 0.8);
                    var gVal = Math.round(30 + (150 - 30) * prob * 0.6);
                    var bVal = Math.round(30 + (255 - 30) * prob);
                    return "rgb(" + rVal + "," + gVal + "," + bVal + ")";
                }
                var rVal = Math.round(255 * (1 - prob * 0.8));
                var gVal = Math.round(255 * (1 - prob * 0.6));
                return "rgb(" + rVal + "," + gVal + ",255)";
            }

            function getTrajectoryForToken(token, pos) {
                for (var li = 0; li < widgetData.cells[pos].length; li++) {
                    var cellData = widgetData.cells[pos][li];
                    if (cellData.token === token) return cellData.trajectory;
                    for (var ki = 0; ki < cellData.topk.length; ki++) {
                        if (cellData.topk[ki].token === token) return cellData.topk[ki].trajectory;
                    }
                }
                return null;  // Return null for untracked tokens
            }

            // Check if a token is tracked (has trajectory data) at a position
            function isTokenTracked(token, pos) {
                for (var li = 0; li < widgetData.cells[pos].length; li++) {
                    var cellData = widgetData.cells[pos][li];
                    if (cellData.token === token) return true;
                    for (var ki = 0; ki < cellData.topk.length; ki++) {
                        if (cellData.topk[ki].token === token) return true;
                    }
                }
                return false;
            }

            // Get rank trajectory for a token at a position
            // Returns array of ranks (1 = top) per layer, or null if not tracked
            function getRankTrajectoryForToken(token, pos) {
                // Check v2Data for explicit rank data
                if (v2Data && v2Data.tracked && v2Data.tracked[pos]) {
                    var tokenData = v2Data.tracked[pos][token];
                    if (tokenData && typeof tokenData === "object" && Array.isArray(tokenData.rank)) {
                        return tokenData.rank;
                    }
                }

                // Fallback: compute approximate rank from topk position at each layer
                // This gives us rank 1 to topk.length, or null if token not in topk
                var ranks = [];
                for (var li = 0; li < widgetData.cells[pos].length; li++) {
                    var cellData = widgetData.cells[pos][li];
                    var rank = null;
                    // Check if it's the top prediction
                    if (cellData.token === token) {
                        rank = 1;
                    } else {
                        // Check topk list
                        for (var ki = 0; ki < cellData.topk.length; ki++) {
                            if (cellData.topk[ki].token === token) {
                                // Rank is position in sorted topk (1-indexed)
                                // topk[0] is highest prob = rank 1, topk[1] = rank 2, etc.
                                rank = ki + 1;
                                break;
                            }
                        }
                    }
                    ranks.push(rank);
                }

                // Return null if no valid ranks found
                var hasValidRank = ranks.some(function(r) { return r !== null; });
                return hasValidRank ? ranks : null;
            }

            // ═══════════════════════════════════════════════════════════════
            // TABLE RENDERING
            // ═══════════════════════════════════════════════════════════════
            //
            // RENDER PIPELINE
            // ---------------
            // The widget has a two-level render pipeline:
            //
            // 1. Full render (buildTable):
            //    - Rebuilds entire table HTML and chart SVG
            //    - Called when: layout changes, rows added/removed, colors change
            //    - Usage: render() or buildTable(cellWidth, indices, maxRows, stride)
            //
            // 2. Chart-only update (drawAllTrajectories):
            //    - Updates only the trajectory chart SVG
            //    - Called when: hovering over cells (shows preview trajectory)
            //    - Usage: drawAllTrajectories(hoverTraj, hoverColor, hoverLabel, width, pos)
            //
            // Most state changes should call render() which rebuilds everything.
            // Hover interactions call drawAllTrajectories() directly for performance.

            // Convenience function to re-render the widget using current state
            function render() {
                buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows, state.currentStride);
            }

            function computeVisibleLayers(cellWidth, containerWidth) {
                var availableWidth = containerWidth - state.inputTokenWidth - 1;
                var maxCols = Math.max(1, Math.floor(availableWidth / cellWidth));

                if (maxCols >= nLayers) {
                    return { stride: 1, indices: widgetData.layers.map(function(_, i) { return i; }) };
                }

                var stride = maxCols > 1
                    ? Math.max(1, Math.floor((nLayers - 1) / (maxCols - 1)))
                    : nLayers;

                var indices = [];
                var lastLayer = nLayers - 1;
                for (var i = lastLayer; i >= 0; i -= stride) {
                    indices.unshift(i);
                }

                while (indices.length > maxCols) {
                    indices.shift();
                }

                return { stride: stride, indices: indices };
            }

            function updateChartDimensions() {
                var table = dom.table();
                var tableWidth = table.offsetWidth;
                var svg = dom.chart();
                svg.setAttribute("width", tableWidth);
                // Update height (important when font size changes and state.chartHeight is auto)
                svg.setAttribute("height", getActualChartHeight());

                var firstInputCell = table.querySelector(".input-token");
                if (firstInputCell) {
                    var tableRect = table.getBoundingClientRect();
                    var inputCellRect = firstInputCell.getBoundingClientRect();
                    var actualInputRight = inputCellRect.right - tableRect.left;
                    return tableWidth - actualInputRight;
                }
                return tableWidth - state.inputTokenWidth;
            }

            function buildTable(cellWidth, visibleLayerIndices, maxRows, stride) {
                state.currentVisibleIndices = visibleLayerIndices;
                state.currentMaxRows = maxRows;
                if (stride !== undefined) state.currentStride = stride;
                var table = dom.table();
                var html = "";

                var totalTokens = widgetData.tokens.length;
                var visiblePositions;
                if (maxRows === null || maxRows >= totalTokens) {
                    visiblePositions = widgetData.tokens.map(function(_, i) { return i; });
                } else {
                    // Smart row visibility: pinned rows are always visible
                    // Two-pass algorithm:
                    // 1. First pass: collect all pinned row positions
                    // 2. Second pass: fill remaining slots with unpinned rows (prioritizing later positions)
                    var pinnedPositions = state.pinnedRows.map(function(pr) { return pr.pos; });
                    var pinnedSet = new Set(pinnedPositions);

                    // If more pinned rows than maxRows, show all pinned rows (exceed maxRows)
                    if (pinnedPositions.length >= maxRows) {
                        // All slots go to pinned rows, plus include the last position if not pinned
                        visiblePositions = pinnedPositions.slice();
                        if (!pinnedSet.has(totalTokens - 1)) {
                            visiblePositions.push(totalTokens - 1);
                        }
                    } else {
                        // Fill remaining slots with unpinned rows from the end
                        var remainingSlots = maxRows - pinnedPositions.length;
                        var unpinnedPositions = [];
                        for (var i = totalTokens - 1; i >= 0 && unpinnedPositions.length < remainingSlots; i--) {
                            if (!pinnedSet.has(i)) {
                                unpinnedPositions.push(i);
                            }
                        }
                        unpinnedPositions.reverse();  // Restore chronological order

                        // Merge pinned and unpinned, maintaining chronological order
                        visiblePositions = [];
                        for (var i = 0; i < totalTokens; i++) {
                            if (pinnedSet.has(i) || unpinnedPositions.indexOf(i) >= 0) {
                                visiblePositions.push(i);
                            }
                        }
                    }
                }

                html += "<colgroup>";
                html += '<col style="width:' + state.inputTokenWidth + 'px;">';
                visibleLayerIndices.forEach(function() {
                    html += '<col style="width:' + cellWidth + 'px;">';
                });
                html += "</colgroup>";

                var halfwayCol = Math.floor(visibleLayerIndices.length / 2);

                // Default colors for heatmap modes
                var defaultBaseColor = "#8844ff";  // purple for "top"
                var defaultNextColor = "#cc6622";  // burnt orange for specific token

                // Helper to get color for a mode
                function getColorForMode(mode) {
                    if (mode === "top") return state.heatmapBaseColor || defaultBaseColor;
                    if (mode === "entropy") return "#9c27b0";  // Purple for uncertainty
                    var groupColor = getColorForToken(mode);
                    if (groupColor) return groupColor;
                    return state.heatmapNextColor || defaultNextColor;
                }

                // Helper to get probability/intensity for a mode at a cell
                // For entropy mode, returns normalized entropy (higher = more uncertainty)
                function getProbForMode(mode, cellData, pos, li) {
                    if (mode === "top") return cellData.prob;
                    if (mode === "entropy") {
                        // Get entropy from v2Data and normalize to 0-1
                        if (v2Data && v2Data.entropy && v2Data.entropy[li]) {
                            return v2Data.entropy[li][pos] / maxEntropy;
                        }
                        return 0;
                    }
                    var found = cellData.topk.find(function(t) { return t.token === mode; });
                    return found ? found.prob : 0;
                }

                visiblePositions.forEach(function(pos, rowIdx) {
                    var tok = widgetData.tokens[pos];
                    var isFirstVisibleRow = rowIdx === 0;
                    var isPinnedRow = findPinnedRow(pos) >= 0;
                    var rowLineStyle = getLineStyleForRow(pos);

                    html += "<tr>";

                    // Input token cell with optional highlight background for pinned rows
                    var inputStyle = "width:" + state.inputTokenWidth + "px; max-width:" + state.inputTokenWidth + "px;";
                    if (isPinnedRow) {
                        inputStyle += isDarkMode() ? " background: #4a4a00; color: #fff;" : " background: #fff59d;";
                    }

                    html += '<td class="input-token' + (isPinnedRow ? ' pinned-row' : '') + '" data-pos="' + pos + '" title="' + escapeHtml(tok) + '" style="' + inputStyle + '">';

                    // Mini SVG line style indicator for pinned rows (scaled with font size)
                    if (isPinnedRow) {
                        var miniScale = getContentFontSizePx() / 10;
                        var miniWidth = 20 * miniScale;
                        var miniHeight = 10 * miniScale;
                        var miniStroke = 1.5 * miniScale;
                        html += '<svg width="' + miniWidth + '" height="' + miniHeight + '" style="vertical-align: middle; margin-right: 2px;">';
                        html += '<line x1="0" y1="' + (miniHeight/2) + '" x2="' + miniWidth + '" y2="' + (miniHeight/2) + '" stroke="' + (isDarkMode() ? '#ccc' : '#333') + '" stroke-width="' + miniStroke + '"';
                        if (rowLineStyle.dash) {
                            var scaledDash = rowLineStyle.dash.split(",").map(function(v) { return parseFloat(v) * miniScale; }).join(",");
                            html += ' stroke-dasharray="' + scaledDash + '"';
                        }
                        html += '/></svg>';
                    }

                    html += escapeHtml(tok);
                    if (isFirstVisibleRow) {
                        html += '<div class="resize-handle-input" data-col="-1"></div>';
                    }
                    html += '</td>';

                    visibleLayerIndices.forEach(function(li, colIdx) {
                        var cellData = widgetData.cells[pos][li];

                        // Find winning mode: highest probability
                        // "top" always loses ties (other modes win on equal prob)
                        var cellProb = 0;
                        var winningColor = null;
                        var winningMode = null;
                        if (state.colorModes.length > 0) {
                            state.colorModes.forEach(function(mode) {
                                var modeProb = getProbForMode(mode, cellData, pos, li);
                                // "top" only wins if strictly greater; others win on >=
                                var wins = (winningMode === "top") ? (modeProb >= cellProb) :
                                           (mode === "top") ? (modeProb > cellProb) :
                                           (modeProb >= cellProb);
                                if (wins) {
                                    cellProb = modeProb;
                                    winningColor = getColorForMode(mode);
                                    winningMode = mode;
                                }
                            });
                        }

                        var color;
                        var textColor;
                        // Check if heatmap is disabled or no color modes
                        if (!state.showHeatmap || state.colorModes.length === 0) {
                            color = isDarkMode() ? "#1e1e1e" : "#fff";
                            textColor = isDarkMode() ? "#e0e0e0" : "#333";
                        } else {
                            color = probToColor(cellProb, winningColor);
                            if (isDarkMode()) {
                                // Dark mode: light text always (glowing colors on dark background)
                                textColor = cellProb < 0.7 ? "#e0e0e0" : "#fff";
                            } else {
                                // Light mode: dark text on light backgrounds, white text on saturated colors
                                textColor = cellProb < 0.5 ? "#333" : "#fff";
                            }
                        }
                        var pinnedColor = getColorForToken(cellData.token);
                        if (!pinnedColor) {
                            var winningGroup = getWinningGroupAtCell(pos, li);
                            if (winningGroup) pinnedColor = winningGroup.color;
                        }
                        var pinnedStyle = pinnedColor ? "box-shadow: inset 0 0 0 2px " + pinnedColor + ";" : "";

                        // Bold the last token in the last layer (main model prediction)
                        var isMainPrediction = (rowIdx === visiblePositions.length - 1) && (colIdx === visibleLayerIndices.length - 1);
                        var boldStyle = isMainPrediction ? "font-weight: bold;" : "";

                        var hasHandle = isFirstVisibleRow && colIdx < halfwayCol;

                        html += '<td class="pred-cell' + (pinnedColor ? ' pinned' : '') + '" ' +
                            'data-pos="' + pos + '" data-li="' + li + '" data-col="' + colIdx + '" ' +
                            'style="background:' + color + '; color:' + textColor + '; width:' + cellWidth + 'px; max-width:' + cellWidth + 'px; ' + pinnedStyle + boldStyle + '">' +
                            escapeHtml(cellData.token);
                        if (hasHandle) {
                            html += '<div class="resize-handle" data-col="' + colIdx + '"></div>';
                        }
                        html += '</td>';
                    });
                    html += "</tr>";
                });

                html += "<tr>";
                html += '<th class="corner-hdr" style="width:' + state.inputTokenWidth + 'px; max-width:' + state.inputTokenWidth + 'px;">Layer<div class="resize-handle-input" data-col="-1"></div></th>';
                visibleLayerIndices.forEach(function(li, colIdx) {
                    var hasHandle = colIdx < halfwayCol;
                    html += '<th class="layer-hdr" style="width:' + cellWidth + 'px; max-width:' + cellWidth + 'px;">' + widgetData.layers[li];
                    if (hasHandle) {
                        html += '<div class="resize-handle" data-col="' + colIdx + '"></div>';
                    }
                    html += '</th>';
                });
                html += "</tr>";

                table.innerHTML = html;
                attachCellListeners();
                attachResizeListeners();

                var containerWidth = getContainerWidth();
                var actualTableWidth = table.offsetWidth;
                if (actualTableWidth > containerWidth) {
                    console.log("Table width overflow detected:", {
                        containerWidth: containerWidth,
                        actualTableWidth: actualTableWidth,
                        overflow: actualTableWidth - containerWidth
                    });
                }

                var chartInnerWidth = updateChartDimensions();
                drawAllTrajectories(null, null, null, chartInnerWidth, state.currentHoverPos);
                updateTitle();

                var hint = dom.resizeHint();
                var hintMain = state.currentStride > 1 ?
                    "showing every " + state.currentStride + " layers ending at " + (nLayers-1) :
                    "showing all " + nLayers + " layers";
                hint.innerHTML = '<span class="resize-hint-main">' + hintMain + '</span><span class="resize-hint-extra"> (drag column borders to adjust)</span>';

                // Hover over hint shows extra text and all resize handles
                hint.addEventListener("mouseenter", function() {
                    hint.querySelector(".resize-hint-extra").style.display = "inline";
                    dom.widget().classList.add("show-all-handles");
                });
                hint.addEventListener("mouseleave", function() {
                    hint.querySelector(".resize-hint-extra").style.display = "none";
                    dom.widget().classList.remove("show-all-handles");
                });
            }

            // ═══════════════════════════════════════════════════════════════
            // TITLE AND MENU MANAGEMENT
            // ═══════════════════════════════════════════════════════════════

            function updateTitle() {
                var titleEl = dom.title();

                // Constrain title width to match state.maxTableWidth if set, but allow wrapping
                if (state.maxTableWidth !== null) {
                    titleEl.style.maxWidth = state.maxTableWidth + "px";
                } else {
                    titleEl.style.maxWidth = "";
                }
                titleEl.style.whiteSpace = "normal";
                var displayLabel = "";
                var pinnedColor = null;
                var useColoredBy = true;

                if (state.colorModes.length === 0) {
                    // No modes = "none"
                    displayLabel = "";
                    useColoredBy = false;
                } else if (state.colorModes.length === 1) {
                    // Single mode - show its name
                    var mode = state.colorModes[0];
                    if (mode === "top") {
                        displayLabel = "top prediction";
                    } else {
                        var groupIdx = findGroupForToken(mode);
                        if (groupIdx >= 0) {
                            var group = state.pinnedGroups[groupIdx];
                            displayLabel = getGroupLabel(group);
                            pinnedColor = group.color;
                        } else {
                            displayLabel = visualizeSpaces(mode);
                        }

                        // Check if selected color matches top prediction at last position
                        var lastPos = widgetData.tokens.length - 1;
                        var lastLayerIdx = state.currentVisibleIndices[state.currentVisibleIndices.length - 1];
                        var topToken = widgetData.cells[lastPos][lastLayerIdx].token;

                        if (mode === topToken) {
                            var tokens = widgetData.tokens.slice();
                            if (tokens.length > 0 && /^<[^>]+>$/.test(tokens[0].trim())) {
                                tokens = tokens.slice(1);
                            }
                            if (tokens.length >= 3) {
                                var suffix = tokens.slice(-3).join("");
                                if (suffix.length > 0 && state.customTitle.endsWith(suffix)) {
                                    useColoredBy = false;
                                }
                            }
                        }
                    }
                } else {
                    // Multiple modes - show all labels joined by " and "
                    var labels = state.colorModes.map(function(mode) {
                        if (mode === "top") return "top prediction";
                        var groupIdx = findGroupForToken(mode);
                        if (groupIdx >= 0) {
                            return getGroupLabel(state.pinnedGroups[groupIdx]);
                        }
                        return visualizeSpaces(mode);
                    });
                    displayLabel = labels.join(" and ");
                }

                var btnStyle = pinnedColor ? "background: " + pinnedColor + "22;" : "";

                // "None" mode: invisible button but still clickable with placeholder text
                if (state.colorModes.length === 0) {
                    btnStyle = "background: transparent; border: none; color: transparent; cursor: pointer;";
                    displayLabel = "colored by None";  // Placeholder for clickable area
                    useColoredBy = false;
                }

                var labelPrefix = useColoredBy ? "colored by " : "";
                var labelContent = "(" + labelPrefix + escapeHtml(displayLabel) + ")";
                titleEl.innerHTML = '<span class="ll-title-text" id="' + uid + '_title_text" style="cursor: text;">' + escapeHtml(state.customTitle) + '</span> <span class="color-mode-btn" id="' + uid + '_color_btn" style="' + btnStyle + '">' + labelContent + '</span>';
                dom.colorBtn().addEventListener("click", showColorModeMenu);
                dom.titleText().addEventListener("click", startTitleEdit);
            }

            function startTitleEdit(e) {
                e.stopPropagation();
                var titleTextEl = dom.titleText();
                var currentText = state.customTitle;
                var input = document.createElement("input");
                input.type = "text";
                input.value = currentText;
                input.style.cssText = "font-size: var(--ll-title-size, 20px); font-weight: 600; font-family: inherit; border: 1px solid #2196F3; border-radius: 3px; padding: 1px 4px; outline: none; width: " + Math.max(200, titleTextEl.offsetWidth) + "px;" + (isDarkMode() ? " background: #1e1e1e; color: #e0e0e0;" : "");

                titleTextEl.innerHTML = "";
                titleTextEl.appendChild(input);
                input.focus();
                input.select();

                function finishEdit() {
                    var newTitle = input.value.trim();
                    if (newTitle) {
                        state.customTitle = newTitle;
                    } else {
                        // Default to concatenated input tokens, omitting special tokens like <s>
                        var tokens = widgetData.tokens.slice();
                        if (tokens.length > 0 && /^<[^>]+>$/.test(tokens[0].trim())) {
                            tokens = tokens.slice(1);
                        }
                        state.customTitle = tokens.join("");
                    }
                    updateTitle();
                }

                input.addEventListener("blur", finishEdit);
                input.addEventListener("keydown", function(ev) {
                    if (ev.key === "Enter") {
                        ev.preventDefault();
                        input.blur();
                    } else if (ev.key === "Escape") {
                        ev.preventDefault();
                        input.value = state.customTitle;  // restore original
                        input.blur();
                    }
                });
            }

            function showColorModeMenu(e) {
                e.stopPropagation();
                // Close other menus/popups first
                closePopup();
                state.colorPickerTarget = null;
                var menu = dom.colorMenu();

                // Toggle: if menu is already visible, just close it
                if (menu.classList.contains("visible")) {
                    menu.classList.remove("visible");
                    return;
                }
                var btn = e.target;
                var rect = btn.getBoundingClientRect();
                var containerRect = dom.widget().getBoundingClientRect();

                menu.style.left = (rect.left - containerRect.left) + "px";
                menu.style.top = (rect.bottom - containerRect.top + 5) + "px";

                var lastPos = widgetData.tokens.length - 1;
                var lastLayerIdx = state.currentVisibleIndices[state.currentVisibleIndices.length - 1];
                var topToken = widgetData.cells[lastPos][lastLayerIdx].token;

                // Build menu items with color swatches
                var menuItems = [];

                // "top prediction" - uses state.heatmapBaseColor
                menuItems.push({
                    mode: "top",
                    label: "top prediction",
                    color: state.heatmapBaseColor || "#8844ff",
                    colorType: "heatmap",
                    groupIdx: null
                });

                // "entropy" - only show if entropy data available
                if (hasEntropyData()) {
                    menuItems.push({
                        mode: "entropy",
                        label: "entropy (uncertainty)",
                        color: "#9c27b0",
                        colorType: "entropy",
                        groupIdx: null
                    });
                }

                // Specific top token (if not pinned) - uses state.heatmapNextColor
                if (findGroupForToken(topToken) < 0) {
                    menuItems.push({
                        mode: topToken,
                        label: topToken,
                        color: state.heatmapNextColor || "#cc6622",
                        colorType: "heatmapNext",
                        groupIdx: null
                    });
                }

                // Pinned groups - each uses its own color
                state.pinnedGroups.forEach(function(group, idx) {
                    var label = getGroupLabel(group);
                    var modeToken = group.tokens[0];
                    menuItems.push({
                        mode: modeToken,
                        label: label,
                        color: group.color,
                        colorType: "trajectory",
                        groupIdx: idx,
                        borderColor: group.color
                    });
                });

                // Build HTML with checkmarks for active modes
                var html = "";
                menuItems.forEach(function(item, idx) {
                    var isActive = state.colorModes.indexOf(item.mode) >= 0;
                    var borderStyle = item.borderColor ? "border-left: 3px solid " + item.borderColor + ";" : "";
                    var checkmark = isActive ? '<span style="padding: 8px 10px 8px 20px; font-weight: bold;">✓</span>' : '<span style="padding: 8px 10px 8px 20px; visibility: hidden;">✓</span>';
                    html += '<div class="color-menu-item" data-mode="' + escapeHtml(item.mode) + '" data-idx="' + idx + '" style="' + borderStyle + '">';
                    html += checkmark + '<span class="color-menu-label">' + escapeHtml(item.label) + '</span>';
                    html += '<input type="color" class="color-swatch" value="' + item.color + '" data-idx="' + idx + '" style="border:0;background:transparent;padding:0;">';
                    html += '</div>';
                });

                // "None" item - no color swatch, but has invisible checkmark for alignment
                var noneActive = state.colorModes.length === 0;
                var noneCheckmark = noneActive ? '<span style="padding: 8px 10px 8px 20px; font-weight: bold;">✓</span>' : '<span style="padding: 8px 10px 8px 20px; visibility: hidden;">✓</span>';
                html += '<div class="color-menu-item" data-mode="none" style="border-top: 1px solid #eee; margin-top: 4px;">' + noneCheckmark + '<span class="color-menu-label">None</span></div>';

                menu.innerHTML = html;
                menu.classList.add("visible");
                showOverlay(closeColorModeMenu);

                // Add click handlers for menu items
                menu.querySelectorAll(".color-menu-item").forEach(function(item) {
                    item.addEventListener("click", function(ev) {
                        // Don't close menu if clicking on color swatch
                        if (ev.target.classList.contains("color-swatch")) return;
                        ev.stopPropagation();

                        var mode = item.dataset.mode;
                        var isModifierClick = ev.shiftKey || ev.ctrlKey || ev.metaKey;

                        if (isModifierClick && mode !== "none") {
                            // Shift/Ctrl/Cmd+click toggles the mode
                            var idx = state.colorModes.indexOf(mode);
                            var checkmarkSpan = item.querySelector("span");
                            if (idx >= 0) {
                                state.colorModes.splice(idx, 1);
                                // Update checkmark to hidden
                                if (checkmarkSpan) {
                                    checkmarkSpan.style.visibility = "hidden";
                                    checkmarkSpan.style.fontWeight = "normal";
                                }
                            } else {
                                state.colorModes.push(mode);
                                // Update checkmark to visible
                                if (checkmarkSpan) {
                                    checkmarkSpan.style.visibility = "visible";
                                    checkmarkSpan.style.fontWeight = "bold";
                                }
                            }
                            // Update None item checkmark based on whether state.colorModes is empty
                            var noneItem = menu.querySelector('.color-menu-item[data-mode="none"]');
                            if (noneItem) {
                                var noneCheckmark = noneItem.querySelector("span");
                                if (noneCheckmark) {
                                    if (state.colorModes.length === 0) {
                                        noneCheckmark.style.visibility = "visible";
                                        noneCheckmark.style.fontWeight = "bold";
                                    } else {
                                        noneCheckmark.style.visibility = "hidden";
                                        noneCheckmark.style.fontWeight = "normal";
                                    }
                                }
                            }
                            // Update table without closing menu
                            buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
                            return;
                        }

                        // Regular click: blink then close menu
                        item.style.animation = "menuBlink-" + uid + " 0.2s ease-in-out";
                        setTimeout(function() {
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

                // Add handlers for color swatches
                menu.querySelectorAll(".color-swatch").forEach(function(swatch) {
                    var idx = parseInt(swatch.dataset.idx);
                    var itemData = menuItems[idx];
                    var menuItem = swatch.closest(".color-menu-item");

                    swatch.addEventListener("click", function(ev) {
                        ev.stopPropagation();
                        // Add picking class to keep item active while picker is open
                        if (menuItem) menuItem.classList.add("picking");
                    });

                    swatch.addEventListener("input", function(ev) {
                        ev.stopPropagation();
                        var newColor = swatch.value;

                        if (itemData.colorType === "heatmap") {
                            state.heatmapBaseColor = newColor;
                        } else if (itemData.colorType === "heatmapNext") {
                            state.heatmapNextColor = newColor;
                        } else if (itemData.colorType === "trajectory" && itemData.groupIdx !== null) {
                            state.pinnedGroups[itemData.groupIdx].color = newColor;
                            // Update the border color on the menu item
                            if (menuItem) menuItem.style.borderLeftColor = newColor;
                        }
                        buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
                    });

                    // Remove picking class when color picker closes
                    swatch.addEventListener("change", function(ev) {
                        if (menuItem) menuItem.classList.remove("picking");
                    });

                    swatch.addEventListener("blur", function(ev) {
                        if (menuItem) menuItem.classList.remove("picking");
                    });
                });
            }

            // ═══════════════════════════════════════════════════════════════
            // RESIZE HANDLING
            // ═══════════════════════════════════════════════════════════════

            function getContainerWidth() {
                var el = dom.widget();
                var actualWidth = el.offsetWidth || 900;
                if (state.maxTableWidth !== null) {
                    return Math.min(state.maxTableWidth, actualWidth);
                }
                return actualWidth;
            }

            function getActualContainerWidth() {
                var el = dom.widget();
                return el.offsetWidth || 900;
            }

            function attachResizeListeners() {
                document.querySelectorAll("#" + uid + " .resize-handle-input").forEach(function(handle) {
                    handle.addEventListener("mousedown", function(e) {
                        closePopup();
                        state.colResizeDrag = { active: true, type: 'input', startX: e.clientX, startWidth: state.inputTokenWidth, colIdx: 0 };
                        handle.classList.add("dragging");
                        e.preventDefault();
                        e.stopPropagation();
                    });
                });

                document.querySelectorAll("#" + uid + " .resize-handle").forEach(function(handle) {
                    var colIdx = parseInt(handle.dataset.col);
                    handle.addEventListener("mousedown", function(e) {
                        closePopup();
                        state.colResizeDrag = { active: true, type: 'column', startX: e.clientX, startWidth: state.currentCellWidth, colIdx: colIdx };
                        handle.classList.add("dragging");
                        e.preventDefault();
                        e.stopPropagation();
                    });
                });
            }

            // Single document-level listeners for column resize (added once per widget)
            document.addEventListener("mousemove", function(e) {
                if (!state.colResizeDrag.active) return;
                var delta = e.clientX - state.colResizeDrag.startX;

                if (state.colResizeDrag.type === 'input') {
                    state.inputTokenWidth = Math.max(40, Math.min(200, state.colResizeDrag.startWidth + delta));
                    var result = computeVisibleLayers(state.currentCellWidth, getContainerWidth());
                    buildTable(state.currentCellWidth, result.indices, state.currentMaxRows, result.stride);
                    notifyLinkedWidgets();
                } else if (state.colResizeDrag.type === 'column') {
                    var numCols = state.colResizeDrag.colIdx + 1;
                    var widthDelta = delta / numCols;
                    var newWidth = Math.max(minCellWidth, Math.min(maxCellWidth, state.colResizeDrag.startWidth + widthDelta));
                    if (Math.abs(newWidth - state.currentCellWidth) > 1) {
                        state.currentCellWidth = newWidth;
                        var result = computeVisibleLayers(state.currentCellWidth, getContainerWidth());
                        buildTable(state.currentCellWidth, result.indices, state.currentMaxRows, result.stride);
                        notifyLinkedWidgets();
                    }
                }
            });

            document.addEventListener("mouseup", function() {
                if (state.colResizeDrag.active) {
                    state.colResizeDrag.active = false;
                    document.querySelectorAll("#" + uid + " .resize-handle-input, #" + uid + " .resize-handle").forEach(function(h) {
                        h.classList.remove("dragging");
                    });
                }
                if (state.yAxisDrag.active) {
                    state.yAxisDrag.active = false;
                }
                if (state.xAxisDrag.active) {
                    state.xAxisDrag.active = false;
                }
                if (state.plotMinLayerDrag.active) {
                    state.plotMinLayerDrag.active = false;
                }
                if (state.rightEdgeDrag.active) {
                    state.rightEdgeDrag.active = false;
                    dom.resizeRight().classList.remove("dragging");
                }
            });

            // X-axis drag for chart height
            document.addEventListener("mousemove", function(e) {
                if (!state.xAxisDrag.active) return;
                var delta = e.clientY - state.xAxisDrag.startY;
                var newHeight = Math.max(minChartHeight, Math.min(maxChartHeight, state.xAxisDrag.startHeight + delta));
                var currentHeight = getActualChartHeight();
                if (Math.abs(newHeight - currentHeight) > 2) {
                    state.chartHeight = newHeight;  // Explicitly set (no longer using default)
                    var svg = dom.chart();
                    svg.setAttribute("height", state.chartHeight);
                    var chartInnerWidth = updateChartDimensions();
                    drawAllTrajectories(null, null, null, chartInnerWidth, state.currentHoverPos);
                }
            });

            document.addEventListener("mousemove", function(e) {
                if (!state.yAxisDrag.active) return;
                var delta = e.clientX - state.yAxisDrag.startX;
                state.inputTokenWidth = Math.max(40, Math.min(200, state.yAxisDrag.startWidth + delta));
                var result = computeVisibleLayers(state.currentCellWidth, getContainerWidth());
                buildTable(state.currentCellWidth, result.indices, state.currentMaxRows, result.stride);
                notifyLinkedWidgets();
            });

            // Plot min layer drag for x-axis zoom
            document.addEventListener("mousemove", function(e) {
                if (!state.plotMinLayerDrag.active) return;
                var delta = e.clientX - state.plotMinLayerDrag.startX;

                // Calculate what state.plotMinLayer value would put the dragged layer at the new x position
                // The relationship is: x = dotRadius + ((layerIdx - state.plotMinLayer) / visibleRange) * (usableWidth - 2*dotRadius)
                // where visibleRange = (nLayers - 1) - state.plotMinLayer
                // Solving for state.plotMinLayer given a new x position for the dragged layer:
                var dr = state.plotMinLayerDrag.dotRadius;
                var uw = state.plotMinLayerDrag.usableWidth;
                var layerIdx = state.plotMinLayerDrag.layerIdx;
                var targetX = state.plotMinLayerDrag.layerXAtStart + delta;

                // Clamp targetX to valid range
                targetX = Math.max(dr, Math.min(uw - dr, targetX));

                // From the formula: targetX = dr + ((layerIdx - newMinLayer) / ((nLayers-1) - newMinLayer)) * (uw - 2*dr)
                // Let's solve for newMinLayer:
                // (targetX - dr) / (uw - 2*dr) = (layerIdx - newMinLayer) / ((nLayers-1) - newMinLayer)
                // Let t = (targetX - dr) / (uw - 2*dr)
                // t * ((nLayers-1) - newMinLayer) = layerIdx - newMinLayer
                // t * (nLayers-1) - t * newMinLayer = layerIdx - newMinLayer
                // t * (nLayers-1) - layerIdx = t * newMinLayer - newMinLayer
                // t * (nLayers-1) - layerIdx = newMinLayer * (t - 1)
                // newMinLayer = (t * (nLayers-1) - layerIdx) / (t - 1)
                var t = (targetX - dr) / (uw - 2 * dr);
                if (Math.abs(t - 1) < 0.001) {
                    // t is very close to 1, which means the layer is at the right edge
                    // This shouldn't happen for draggable layers (only last is non-draggable)
                    return;
                }
                var newMinLayer = (t * (nLayers - 1) - layerIdx) / (t - 1);

                // Clamp to valid range: 0 <= state.plotMinLayer < nLayers - 1
                // Also can't set it beyond the dragged layer (that would flip the axis)
                newMinLayer = Math.max(0, Math.min(layerIdx - 0.1, newMinLayer));

                if (Math.abs(newMinLayer - state.plotMinLayer) > 0.01) {
                    state.plotMinLayer = newMinLayer;
                    var chartInnerWidth = updateChartDimensions();
                    drawAllTrajectories(null, null, null, chartInnerWidth, state.currentHoverPos);
                }
            });

            // ═══════════════════════════════════════════════════════════════
            // CELL INTERACTION AND POPUP
            // ═══════════════════════════════════════════════════════════════

            function attachCellListeners() {
                document.querySelectorAll("#" + uid + " .pred-cell, #" + uid + " .input-token").forEach(function(cell) {
                    var pos = parseInt(cell.dataset.pos);
                    if (isNaN(pos)) return;
                    var isInputToken = cell.classList.contains("input-token");

                    cell.addEventListener("mouseenter", function() {
                        state.currentHoverPos = pos;
                        var chartInnerWidth = updateChartDimensions();

                        if (isInputToken) {
                            // For input tokens, show the token that would be auto-pinned (if any)
                            var bestToken = findHighestProbToken(pos, 2, 0.05);
                            if (bestToken && findGroupForToken(bestToken) < 0) {
                                var traj = getTrajectoryForToken(bestToken, pos);
                                drawAllTrajectories(traj, "#999", bestToken, chartInnerWidth, pos);
                            } else {
                                drawAllTrajectories(null, null, null, chartInnerWidth, pos);
                            }
                        } else {
                            // For prediction cells, show that cell's token trajectory
                            // Always show hover trajectory (gray line) even if token is pinned
                            // This allows both row-based colored lines and cell-based gray lines to coexist
                            var li = cell.dataset.li ? parseInt(cell.dataset.li) : 0;
                            var cellData = widgetData.cells[pos][li] || widgetData.cells[pos][0];
                            drawAllTrajectories(cellData.trajectory, "#999", cellData.token, chartInnerWidth, pos);
                        }
                    });

                    cell.addEventListener("mouseleave", function() {
                        // Clear hover trajectory when leaving cell
                        var chartInnerWidth = updateChartDimensions();
                        drawAllTrajectories(null, null, null, chartInnerWidth, state.currentHoverPos);
                    });
                });

                // Input token click handler for row pinning
                document.querySelectorAll("#" + uid + " .input-token").forEach(function(cell) {
                    var pos = parseInt(cell.dataset.pos);
                    if (isNaN(pos)) return;

                    cell.addEventListener("click", function(e) {
                        e.stopPropagation();
                        closePopup();
                        dom.colorMenu().classList.remove("visible");
                        togglePinnedRow(pos);
                        buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
                    });
                });

                document.querySelectorAll("#" + uid + " .pred-cell").forEach(function(cell) {
                    var pos = parseInt(cell.dataset.pos);
                    var li = parseInt(cell.dataset.li);
                    var cellData = widgetData.cells[pos][li];

                    cell.addEventListener("click", function(e) {
                        e.stopPropagation();
                        var addToGroup = e.shiftKey || e.ctrlKey || e.metaKey;

                        if (e.shiftKey) {
                            togglePinnedTrajectory(cellData.token, addToGroup);
                            buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
                            return;
                        }
                        // If color menu is open, first click just dismisses it
                        var colorMenu = dom.colorMenu();
                        if (colorMenu && colorMenu.classList.contains("visible")) {
                            colorMenu.classList.remove("visible");
                            return;
                        }
                        // If popup is open, first click just dismisses it (even on different cell)
                        if (state.openPopupCell) { closePopup(); return; }
                        document.querySelectorAll("#" + uid + " .pred-cell.selected").forEach(function(c) { c.classList.remove("selected"); });
                        cell.classList.add("selected");
                        showPopup(cell, pos, li, cellData);
                    });
                });

                dom.popupClose().addEventListener("click", closePopup);
            }

            function closePopup() {
                var popup = dom.popup();
                if (popup) popup.classList.remove("visible");
                document.querySelectorAll("#" + uid + " .pred-cell.selected").forEach(function(c) { c.classList.remove("selected"); });
                state.openPopupCell = null;
                removeOverlay();
            }

            function closeColorModeMenu() {
                var menu = dom.colorMenu();
                if (menu) menu.classList.remove("visible");
                removeOverlay();
            }

            // Invisible overlay to catch clicks outside popup/menu
            function showOverlay(onDismiss) {
                removeOverlay(); // Remove any existing overlay first
                var overlay = document.createElement("div");
                overlay.id = uid + "_overlay";
                overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:50;";
                overlay.addEventListener("mousedown", function(e) {
                    e.stopPropagation();
                    e.preventDefault();
                    onDismiss();
                });
                document.body.appendChild(overlay);
            }

            function removeOverlay() {
                var overlay = dom.overlay();
                if (overlay) overlay.remove();
            }

            function showPopup(cell, pos, li, cellData) {
                // Close other menus/popups first
                closeColorModeMenu();
                state.colorPickerTarget = null;
                state.openPopupCell = cell;
                var popup = dom.popup();
                var rect = cell.getBoundingClientRect();
                var containerRect = dom.widget().getBoundingClientRect();
                var viewportWidth = window.innerWidth;
                var gap = 5;

                // Default position (to the right of cell)
                popup.style.left = (rect.left - containerRect.left + rect.width + gap) + "px";
                popup.style.top = (rect.top - containerRect.top) + "px";

                dom.popupLayer().textContent = widgetData.layers[li];
                dom.popupPos().innerHTML = pos + "<br>Input <code>" + escapeHtml(visualizeSpaces(widgetData.tokens[pos])) + "</code>";

                var contentHtml = "";
                cellData.topk.forEach(function(item, ki) {
                    var probPct = (item.prob * 100).toFixed(1);
                    var pinnedColor = getColorForToken(item.token);
                    var pinnedStyle = pinnedColor ? "background: " + pinnedColor + "22; border-left-color: " + pinnedColor + ";" : "";
                    var visualizedToken = visualizeSpaces(item.token);
                    var tooltipToken = visualizeSpaces(item.token, true);  // Spell out entities for tooltip
                    contentHtml += '<div class="topk-item' + (pinnedColor ? ' pinned' : '') + '" data-ki="' + ki + '" style="' + pinnedStyle + '" title="' + escapeHtml(tooltipToken) + '">';
                    contentHtml += '<span class="topk-token">' + escapeHtml(visualizedToken) + '</span>';
                    contentHtml += '<span class="topk-prob">' + probPct + '%</span>';
                    contentHtml += '</div>';
                });

                // Add hint if first token is pinned and there are similar tokens
                var firstToken = cellData.topk[0].token;
                var firstIsPinned = findGroupForToken(firstToken) >= 0;
                if (firstIsPinned && hasSimilarTokensInList(cellData.topk, firstToken)) {
                    contentHtml += '<div style="font-size: var(--ll-content-size, 14px); font-style: italic; color: #666; margin-top: 8px; padding-top: 6px; border-top: 1px solid #eee;">Shift-click to group tokens</div>';
                }

                dom.popupContent().innerHTML = contentHtml;

                document.querySelectorAll("#" + uid + "_popup_content .topk-item").forEach(function(item) {
                    var ki = parseInt(item.dataset.ki);
                    var tokData = cellData.topk[ki];

                    item.addEventListener("mouseenter", function() {
                        document.querySelectorAll("#" + uid + "_popup_content .topk-item").forEach(function(it) { it.classList.remove("active"); });
                        item.classList.add("active");
                        var chartInnerWidth = updateChartDimensions();
                        // Always show hover trajectory even if token is pinned
                        drawAllTrajectories(tokData.trajectory, "#999", tokData.token, chartInnerWidth, pos);
                    });

                    item.addEventListener("mouseleave", function() {
                        item.classList.remove("active");
                        var chartInnerWidth = updateChartDimensions();
                        drawAllTrajectories(null, null, null, chartInnerWidth, pos);
                    });

                    item.addEventListener("click", function(e) {
                        e.stopPropagation();
                        var addToGroup = e.shiftKey || e.ctrlKey || e.metaKey;
                        togglePinnedTrajectory(tokData.token, addToGroup);
                        buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
                        var newCell = document.querySelector("#" + uid + " .pred-cell[data-pos='" + pos + "'][data-li='" + li + "']");
                        if (newCell) {
                            newCell.classList.add("selected");
                            showPopup(newCell, pos, li, cellData);
                        }
                    });
                });

                popup.classList.add("visible");
                // Reposition if popup overflows right edge of viewport
                var popupRect = popup.getBoundingClientRect();
                if (popupRect.right > viewportWidth && rect.left - gap - popupRect.width >= 0) {
                    popup.style.left = (rect.left - containerRect.left - popupRect.width - gap) + "px";
                }
                showOverlay(closePopup);
                var chartInnerWidth = updateChartDimensions();
                // Always show hover trajectory even if token is pinned
                drawAllTrajectories(cellData.trajectory, "#999", cellData.token, chartInnerWidth, pos);
            }

            function togglePinnedTrajectory(token, addToGroup) {
                var existingGroupIdx = findGroupForToken(token);

                if (addToGroup && state.lastPinnedGroupIndex >= 0 && state.lastPinnedGroupIndex < state.pinnedGroups.length) {
                    var lastGroup = state.pinnedGroups[state.lastPinnedGroupIndex];

                    if (existingGroupIdx === state.lastPinnedGroupIndex) {
                        lastGroup.tokens = lastGroup.tokens.filter(function(t) { return t !== token; });
                        if (lastGroup.tokens.length === 0) {
                            state.pinnedGroups.splice(state.lastPinnedGroupIndex, 1);
                            state.lastPinnedGroupIndex = state.pinnedGroups.length - 1;
                        }
                        return false;
                    } else if (existingGroupIdx >= 0) {
                        state.pinnedGroups[existingGroupIdx].tokens = state.pinnedGroups[existingGroupIdx].tokens.filter(function(t) { return t !== token; });
                        if (state.pinnedGroups[existingGroupIdx].tokens.length === 0) {
                            state.pinnedGroups.splice(existingGroupIdx, 1);
                            if (state.lastPinnedGroupIndex > existingGroupIdx) state.lastPinnedGroupIndex--;
                        }
                        lastGroup.tokens.push(token);
                        return true;
                    } else {
                        lastGroup.tokens.push(token);
                        return true;
                    }
                } else {
                    if (existingGroupIdx >= 0) {
                        var group = state.pinnedGroups[existingGroupIdx];
                        group.tokens = group.tokens.filter(function(t) { return t !== token; });
                        if (group.tokens.length === 0) {
                            state.pinnedGroups.splice(existingGroupIdx, 1);
                            if (state.lastPinnedGroupIndex >= state.pinnedGroups.length) {
                                state.lastPinnedGroupIndex = state.pinnedGroups.length - 1;
                            }
                        }
                        return false;
                    } else {
                        var newGroup = { color: getNextColor(), tokens: [token] };
                        state.pinnedGroups.push(newGroup);
                        state.lastPinnedGroupIndex = state.pinnedGroups.length - 1;
                        return true;
                    }
                }
            }

            // ═══════════════════════════════════════════════════════════════
            // CHART RENDERING
            // ═══════════════════════════════════════════════════════════════

            function drawAllTrajectories(hoverTrajectory, hoverColor, hoverLabel, chartInnerWidth, pos) {
                // ─────────────────────────────────────────────────────────────
                // SETUP: Initialize SVG and calculate dimensions
                // ─────────────────────────────────────────────────────────────
                var svg = dom.chart();
                svg.innerHTML = "";

                var table = dom.table();
                var firstInputCell = table.querySelector(".input-token");
                var tableRect = table.getBoundingClientRect();
                var inputCellRect = firstInputCell.getBoundingClientRect();
                var actualInputRight = inputCellRect.right - tableRect.left;

                var legendG = document.createElementNS("http://www.w3.org/2000/svg", "g");
                legendG.setAttribute("class", "legend-area");
                svg.appendChild(legendG);

                var chartMargin = getChartMargin();
                var chartInnerHeight = getChartInnerHeight();

                var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
                g.setAttribute("transform", "translate(" + actualInputRight + "," + chartMargin.top + ")");
                svg.appendChild(g);

                // ─────────────────────────────────────────────────────────────
                // X-AXIS: Create draggable x-axis for chart height resize
                // ─────────────────────────────────────────────────────────────
                var xAxisGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
                xAxisGroup.style.cursor = "row-resize";

                // Add hover background for x-axis (hidden by default)
                var xAxisHoverBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                xAxisHoverBg.setAttribute("x", 0); xAxisHoverBg.setAttribute("y", chartInnerHeight - 2);
                xAxisHoverBg.setAttribute("width", chartInnerWidth); xAxisHoverBg.setAttribute("height", 4);
                xAxisHoverBg.setAttribute("fill", "rgba(33, 150, 243, 0.3)");
                xAxisHoverBg.style.display = "none";
                xAxisHoverBg.classList.add("xaxis-hover-bg");
                xAxisGroup.appendChild(xAxisHoverBg);

                // Invisible wider hit target for easier dragging
                var xAxisHitTarget = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                xAxisHitTarget.setAttribute("x", 0); xAxisHitTarget.setAttribute("y", chartInnerHeight - 4);
                xAxisHitTarget.setAttribute("width", chartInnerWidth); xAxisHitTarget.setAttribute("height", 8);
                xAxisHitTarget.setAttribute("fill", "transparent");
                xAxisGroup.appendChild(xAxisHitTarget);

                var xAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
                xAxis.setAttribute("x1", 0); xAxis.setAttribute("y1", chartInnerHeight);
                xAxis.setAttribute("x2", chartInnerWidth); xAxis.setAttribute("y2", chartInnerHeight);
                xAxis.setAttribute("stroke", "#ccc");
                xAxisGroup.appendChild(xAxis);
                g.appendChild(xAxisGroup);

                xAxisGroup.addEventListener("mouseenter", function() {
                    xAxisHoverBg.style.display = "block";
                });
                xAxisGroup.addEventListener("mouseleave", function() {
                    xAxisHoverBg.style.display = "none";
                });
                xAxisGroup.addEventListener("mousedown", function(e) {
                    closePopup();
                    state.xAxisDrag = { active: true, startY: e.clientY, startHeight: getActualChartHeight() };
                    xAxis.setAttribute("stroke", "rgba(33, 150, 243, 0.6)");
                    e.preventDefault();
                    e.stopPropagation();
                });

                // Scale dot radius and stroke width proportionally with font size
                var fontScale = getContentFontSizePx() / 10;
                var dotRadius = 3 * fontScale;
                var strokeWidth = 2 * fontScale;
                var strokeWidthHover = 1.5 * fontScale;
                var labelMargin = chartMargin.right;
                var usableWidth = chartInnerWidth - labelMargin;

                // X-axis scaling: maps layers to x positions, accounting for state.plotMinLayer zoom
                // Layer state.plotMinLayer maps to x=dotRadius (left edge)
                // Layer (nLayers-1) maps to x=usableWidth-dotRadius (right edge)
                function layerToXForLabels(layerIdx) {
                    if (nLayers <= 1) return usableWidth / 2;
                    var visibleLayerRange = (nLayers - 1) - state.plotMinLayer;
                    if (visibleLayerRange <= 0) return usableWidth / 2;
                    return dotRadius + ((layerIdx - state.plotMinLayer) / visibleLayerRange) * (usableWidth - 2 * dotRadius);
                }

                // Add clip-path to clip trajectories at left edge when zoomed
                // Extend left and up to include y-axis tick label (scales with font size)
                var clipId = uid + "_chart_clip";
                var defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
                var clipPath = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
                clipPath.setAttribute("id", clipId);
                var clipRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                // Left extent: room for "100.00%" label (~7 chars at 0.6em each) plus generous padding
                var clipFontSize = getContentFontSizePx();
                var clipLeftExtent = 10 + clipFontSize * 5;
                // Top extent: room for tick label ascenders above y=0
                var clipTopExtent = clipFontSize * 1.2;
                clipRect.setAttribute("x", -clipLeftExtent);
                clipRect.setAttribute("y", -clipTopExtent);
                clipRect.setAttribute("width", chartInnerWidth + clipLeftExtent);
                clipRect.setAttribute("height", chartInnerHeight + clipTopExtent + chartMargin.bottom + clipFontSize * 0.5);
                clipPath.appendChild(clipRect);
                defs.appendChild(clipPath);
                svg.appendChild(defs);

                // Apply clip-path to the main chart group
                g.setAttribute("clip-path", "url(#" + clipId + ")");

                // Create a separate clip-path for trajectories that clips at x=0
                // (the plot area edge, not extending into y-axis label area)
                var trajClipId = uid + "_traj_clip";
                var trajClipPath = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
                trajClipPath.setAttribute("id", trajClipId);
                var trajClipRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                trajClipRect.setAttribute("x", "0");
                trajClipRect.setAttribute("y", -clipTopExtent);
                trajClipRect.setAttribute("width", chartInnerWidth);
                trajClipRect.setAttribute("height", chartInnerHeight + clipTopExtent + 10);
                trajClipPath.appendChild(trajClipRect);
                defs.appendChild(trajClipPath);

                // Create trajectory group with its own clip-path
                var trajG = document.createElementNS("http://www.w3.org/2000/svg", "g");
                trajG.setAttribute("clip-path", "url(#" + trajClipId + ")");
                g.appendChild(trajG)

                // Calculate tick label stride based on actual pixel spacing
                // Aim for ~24px minimum gap between tick labels
                var minTickGap = 24;
                var labelStride = 1;
                if (state.currentVisibleIndices.length >= 2) {
                    // Calculate pixel distance between consecutive visible layer indices
                    var firstX = layerToXForLabels(state.currentVisibleIndices[0]);
                    var secondX = layerToXForLabels(state.currentVisibleIndices[1]);
                    var pixelsPerIndex = Math.abs(secondX - firstX);
                    // Only adjust stride if we have meaningful pixel spacing
                    // (In jsdom/no-layout environments, pixelsPerIndex may be 0 or tiny)
                    if (pixelsPerIndex >= 1 && pixelsPerIndex < minTickGap) {
                        labelStride = Math.ceil(minTickGap / pixelsPerIndex);
                    }
                }

                var lastIdx = state.currentVisibleIndices.length - 1;
                var showAtIndex = new Set();
                for (var i = lastIdx; i >= 0; i -= labelStride) {
                    showAtIndex.add(i);
                }
                showAtIndex.add(0);
                if (labelStride > 1) {
                    for (var i = lastIdx; i > 0; i -= labelStride) {
                        if (i < labelStride) {
                            showAtIndex.delete(i);
                            break;
                        }
                    }
                }

                // X-axis tick labels (all except last are draggable for x-zoom)
                // Skip labels that would appear to the left of x=0 when zoomed (don't rely on clipping)
                var isLastVisibleIndex = state.currentVisibleIndices.length - 1;
                var minXForLabel = 8; // Half width of label, so text doesn't get cut off
                state.currentVisibleIndices.forEach(function(layerIdx, i) {
                    if (showAtIndex.has(i)) {
                        var x = layerToXForLabels(layerIdx);
                        // Skip labels that would be drawn too far left (only when zoomed)
                        if (state.plotMinLayer > 0 && x < minXForLabel) return;

                        var isLast = (i === isLastVisibleIndex);
                        var isDraggable = !isLast && layerIdx > 0;

                        // Create a group for the tick label (for hover effects)
                        var tickGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");

                        // Add hover highlight background (hidden by default)
                        // Size to fit tick label text plus small padding
                        var fontSize = getContentFontSizePx();
                        if (isDraggable) {
                            var hoverBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                            var bgWidth = Math.max(16, fontSize * 1.6);
                            var bgHeight = fontSize + 2;
                            hoverBg.setAttribute("x", x - bgWidth / 2);
                            hoverBg.setAttribute("y", chartInnerHeight + 2);
                            hoverBg.setAttribute("width", bgWidth);
                            hoverBg.setAttribute("height", bgHeight);
                            hoverBg.setAttribute("rx", 2);
                            hoverBg.setAttribute("fill", "rgba(33, 150, 243, 0.3)");
                            hoverBg.style.display = "none";
                            hoverBg.classList.add("tick-hover-bg");
                            tickGroup.appendChild(hoverBg);
                        }

                        var label = document.createElementNS("http://www.w3.org/2000/svg", "text");
                        label.setAttribute("x", x);
                        label.setAttribute("y", chartInnerHeight + 2 + fontSize);
                        label.setAttribute("text-anchor", "middle");
                        label.style.fontSize = "var(--ll-content-size, 14px)";
                        label.setAttribute("fill", isDarkMode() ? "#aaa" : "#666");
                        label.textContent = widgetData.layers[layerIdx];
                        tickGroup.appendChild(label);

                        if (isDraggable) {
                            tickGroup.style.cursor = "col-resize";
                            tickGroup.dataset.layerIdx = layerIdx;

                            tickGroup.addEventListener("mouseenter", function() {
                                var bg = tickGroup.querySelector(".tick-hover-bg");
                                if (bg) bg.style.display = "block";
                            });
                            tickGroup.addEventListener("mouseleave", function() {
                                var bg = tickGroup.querySelector(".tick-hover-bg");
                                if (bg) bg.style.display = "none";
                            });
                            tickGroup.addEventListener("mousedown", function(e) {
                                closePopup();
                                var layerIdxDragged = parseInt(tickGroup.dataset.layerIdx);
                                state.plotMinLayerDrag = {
                                    active: true,
                                    startX: e.clientX,
                                    startMinLayer: state.plotMinLayer,
                                    layerIdx: layerIdxDragged,
                                    layerXAtStart: layerToXForLabels(layerIdxDragged),
                                    usableWidth: usableWidth,
                                    dotRadius: dotRadius
                                };
                                e.preventDefault();
                                e.stopPropagation();
                            });
                        }

                        g.appendChild(tickGroup);
                    }
                });

                // ─────────────────────────────────────────────────────────────
                // Y-AXIS: Create draggable y-axis for input column resize
                // ─────────────────────────────────────────────────────────────
                var yAxisGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
                yAxisGroup.style.cursor = "col-resize";

                // Add hover background for y-axis (hidden by default)
                var yAxisHoverBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                yAxisHoverBg.setAttribute("x", -2); yAxisHoverBg.setAttribute("y", 0);
                yAxisHoverBg.setAttribute("width", 4); yAxisHoverBg.setAttribute("height", chartInnerHeight);
                yAxisHoverBg.setAttribute("fill", "rgba(33, 150, 243, 0.3)");
                yAxisHoverBg.style.display = "none";
                yAxisHoverBg.classList.add("yaxis-hover-bg");
                yAxisGroup.appendChild(yAxisHoverBg);

                var yAxisHitTarget = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                yAxisHitTarget.setAttribute("x", -4); yAxisHitTarget.setAttribute("y", 0);
                yAxisHitTarget.setAttribute("width", 8); yAxisHitTarget.setAttribute("height", chartInnerHeight);
                yAxisHitTarget.setAttribute("fill", "transparent");
                yAxisGroup.appendChild(yAxisHitTarget);

                var yAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
                yAxis.setAttribute("x1", 0); yAxis.setAttribute("y1", 0);
                yAxis.setAttribute("x2", 0); yAxis.setAttribute("y2", chartInnerHeight);
                yAxis.setAttribute("stroke", "#ccc");
                yAxisGroup.appendChild(yAxis);
                g.appendChild(yAxisGroup);

                yAxisGroup.addEventListener("mouseenter", function() {
                    yAxisHoverBg.style.display = "block";
                });
                yAxisGroup.addEventListener("mouseleave", function() {
                    yAxisHoverBg.style.display = "none";
                });
                yAxisGroup.addEventListener("mousedown", function(e) {
                    closePopup();
                    state.yAxisDrag = { active: true, startX: e.clientX, startWidth: state.inputTokenWidth };
                    yAxis.setAttribute("stroke", "rgba(33, 150, 243, 0.6)");
                    e.preventDefault();
                    e.stopPropagation();
                });

                var yLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
                yLabel.setAttribute("x", -chartInnerHeight / 2);
                yLabel.setAttribute("y", -actualInputRight + 15);
                yLabel.setAttribute("text-anchor", "middle");
                yLabel.style.fontSize = "var(--ll-content-size, 14px)";
                yLabel.setAttribute("fill", "#666");
                yLabel.setAttribute("transform", "rotate(-90)");
                yLabel.textContent = state.trajectoryMetric === "rank" ? "Rank" : "Probability";
                svg.appendChild(yLabel);

                // Determine which positions to show trajectories for
                var positionsToShow = [];
                if (state.pinnedRows.length > 0) {
                    // Only show pinned rows
                    state.pinnedRows.forEach(function(pr) { positionsToShow.push(pr.pos); });
                } else {
                    // Show current hover position
                    positionsToShow.push(pos);
                }

                var allValues = [];
                positionsToShow.forEach(function(showPos) {
                    state.pinnedGroups.forEach(function(group) {
                        var traj = getGroupTrajectory(group, showPos);
                        if (traj) {
                            traj.forEach(function(v) { if (v !== null) allValues.push(v); });
                        }
                    });
                });
                if (hoverTrajectory) {
                    hoverTrajectory.forEach(function(v) { if (v !== null) allValues.push(v); });
                }

                // ─────────────────────────────────────────────────────────────
                // SCALE CALCULATION: Determine y-axis scale and labels
                // ─────────────────────────────────────────────────────────────
                var isRankMode = state.trajectoryMetric === "rank";
                var maxValue;
                if (isRankMode) {
                    // For rank: max rank determines scale (min is always 1)
                    var rawMaxRank = allValues.length > 0 ? Math.max.apply(null, allValues) : 10;
                    maxValue = Math.max(rawMaxRank, 2);  // At least rank 2 for scale
                } else {
                    // For probability: max prob determines scale
                    var rawMaxProb = allValues.length > 0 ? Math.max.apply(null, allValues.concat([0.001])) : 0.001;
                    maxValue = niceMax(rawMaxProb);
                }

                // Draw scale tick and label at top of y-axis (only if there's data)
                var hasData = state.pinnedGroups.length > 0 || (hoverTrajectory && hoverLabel);
                if (hasData) {
                    var tickY = 0;  // top of chart
                    var tickLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
                    tickLine.setAttribute("x1", -3); tickLine.setAttribute("y1", tickY);
                    tickLine.setAttribute("x2", 3); tickLine.setAttribute("y2", tickY);
                    tickLine.setAttribute("stroke", "#999");
                    g.appendChild(tickLine);

                    // Position label so it's vertically centered on the tick (uses 0.9x font size)
                    var tickFontSize = getContentFontSizePx() * 0.9;
                    var tickLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    tickLabel.setAttribute("x", -5);
                    tickLabel.setAttribute("y", tickY + tickFontSize * 0.35);  // ~1/3 of font size below baseline
                    tickLabel.setAttribute("text-anchor", "end");
                    tickLabel.style.fontSize = "calc(var(--ll-content-size, 14px) * 0.9)";
                    tickLabel.setAttribute("fill", isDarkMode() ? "#aaa" : "#666");
                    // For rank: show "1" at top (best rank), for probability: show max percentage
                    tickLabel.textContent = isRankMode ? "1" : formatPct(maxValue);
                    g.appendChild(tickLabel);
                }

                // Calculate legend entry count for vertical centering
                var legendEntryCount = 0;
                if (state.pinnedRows.length > 1 && state.pinnedGroups.length === 1) {
                    legendEntryCount = 1 + state.pinnedRows.length;  // title + row entries
                } else {
                    legendEntryCount = state.pinnedGroups.length;
                }
                if (hoverTrajectory && hoverLabel) {
                    legendEntryCount += 1;  // hover entry
                }
                // Scale legend dimensions with font size (base values at 10px font)
                var legendEntryHeight = 14 * fontScale;
                var legendLineLength = 20 * fontScale;       // Length of line sample
                var legendTextX = 25 * fontScale;            // X position of text after line
                var legendTextY = 4 * fontScale;             // Baseline offset for text
                var legendCloseX = -12 * fontScale;          // Close button X position
                var legendIndent = 18 * fontScale;           // Indentation for legend items
                var legendTotalHeight = legendEntryCount * legendEntryHeight;
                var legendY = chartMargin.top + Math.max(10 * fontScale, (chartInnerHeight - legendTotalHeight) / 2);

                // ─────────────────────────────────────────────────────────────
                // TRAJECTORIES: Draw pinned trajectory lines
                // ─────────────────────────────────────────────────────────────
                positionsToShow.forEach(function(showPos) {
                    var lineStyle = getLineStyleForRow(showPos);

                    state.pinnedGroups.forEach(function(group, groupIdx) {
                        var traj = getGroupTrajectory(group, showPos);
                        var groupLabel = getGroupLabel(group);
                        drawSingleTrajectory(trajG, traj, group.color, maxValue, groupLabel, false, chartInnerWidth, lineStyle.dash, isRankMode);
                    });
                });

                // ─────────────────────────────────────────────────────────────
                // LEGEND: Draw legend entries for pinned trajectories
                // ─────────────────────────────────────────────────────────────
                // Special case: multiple pinned rows with single group - show group as title, rows as entries
                if (state.pinnedRows.length > 1 && state.pinnedGroups.length === 1) {
                    var group = state.pinnedGroups[0];
                    var groupLabel = getGroupLabel(group);

                    // Title entry (group label, no line, outdented, clipped to not exceed y-axis)
                    var titleItem = document.createElementNS("http://www.w3.org/2000/svg", "g");
                    titleItem.setAttribute("transform", "translate(5, " + legendY + ")");

                    var titleClipId = uid + "_legend_title_clip";
                    var titleClipPath = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
                    titleClipPath.setAttribute("id", titleClipId);
                    var titleClipRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    titleClipRect.setAttribute("x", "0"); titleClipRect.setAttribute("y", "-10");
                    titleClipRect.setAttribute("width", actualInputRight - 10); titleClipRect.setAttribute("height", "20");
                    titleClipPath.appendChild(titleClipRect);
                    titleItem.appendChild(titleClipPath);

                    var titleText = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    titleText.setAttribute("x", "0"); titleText.setAttribute("y", legendTextY);
                    titleText.style.fontSize = "var(--ll-content-size, 14px)"; titleText.setAttribute("fill", group.color);
                    titleText.setAttribute("font-weight", "600");
                    titleText.setAttribute("clip-path", "url(#" + titleClipId + ")");
                    titleText.textContent = groupLabel;
                    titleItem.appendChild(titleText);
                    legendG.appendChild(titleItem);
                    legendY += legendEntryHeight;

                    // Entry per pinned row
                    state.pinnedRows.forEach(function(pr, prIdx) {
                        var rowToken = widgetData.tokens[pr.pos];
                        var lineStyle = pr.lineStyle;

                        var legendItem = document.createElementNS("http://www.w3.org/2000/svg", "g");
                        legendItem.setAttribute("transform", "translate(" + legendIndent + ", " + legendY + ")");
                        legendItem.style.cursor = "pointer";

                        var hitTarget = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                        hitTarget.setAttribute("x", "-15"); hitTarget.setAttribute("y", "-8");
                        hitTarget.setAttribute("width", state.inputTokenWidth - 5); hitTarget.setAttribute("height", "14");
                        hitTarget.setAttribute("fill", "transparent");
                        legendItem.appendChild(hitTarget);

                        var closeBtn = document.createElementNS("http://www.w3.org/2000/svg", "text");
                        closeBtn.setAttribute("class", "legend-close");
                        closeBtn.setAttribute("x", legendCloseX); closeBtn.setAttribute("y", "4");
                        closeBtn.style.fontSize = "var(--ll-title-size, 20px)"; closeBtn.setAttribute("fill", "#999");
                        closeBtn.style.display = "none";
                        closeBtn.textContent = "\u00d7";
                        legendItem.appendChild(closeBtn);

                        var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                        line.setAttribute("x1", "0"); line.setAttribute("y1", "0");
                        line.setAttribute("x2", 20 * fontScale); line.setAttribute("y2", "0");
                        line.setAttribute("stroke", group.color); line.setAttribute("stroke-width", strokeWidth);
                        if (lineStyle.dash) {
                            var scaledDash = lineStyle.dash.split(",").map(function(v) { return parseFloat(v) * fontScale; }).join(",");
                            line.setAttribute("stroke-dasharray", scaledDash);
                        }
                        legendItem.appendChild(line);

                        var clipId = uid + "_legend_row_clip_" + prIdx;
                        var clipPath = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
                        clipPath.setAttribute("id", clipId);
                        var clipRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                        clipRect.setAttribute("x", legendTextX); clipRect.setAttribute("y", -10 * fontScale);
                        clipRect.setAttribute("width", state.inputTokenWidth - 50 * fontScale); clipRect.setAttribute("height", 20 * fontScale);
                        clipPath.appendChild(clipRect);
                        legendItem.appendChild(clipPath);

                        var text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                        text.setAttribute("x", legendTextX); text.setAttribute("y", legendTextY);
                        text.style.fontSize = "var(--ll-content-size, 14px)"; text.setAttribute("fill", isDarkMode() ? "#ddd" : "#333");
                        text.setAttribute("clip-path", "url(#" + clipId + ")");
                        text.textContent = visualizeSpaces(rowToken);
                        legendItem.appendChild(text);

                        legendItem.addEventListener("mouseenter", function() { closeBtn.style.display = "block"; });
                        legendItem.addEventListener("mouseleave", function() { closeBtn.style.display = "none"; });
                        closeBtn.addEventListener("click", function(e) {
                            e.stopPropagation();
                            // Unpin this row
                            state.pinnedRows.splice(prIdx, 1);
                            buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
                        });

                        legendG.appendChild(legendItem);
                        legendY += legendEntryHeight;
                    });
                } else {
                    // Standard legend: one entry per pinned group
                    state.pinnedGroups.forEach(function(group, groupIdx) {
                        var groupLabel = getGroupLabel(group);

                        var legendItem = document.createElementNS("http://www.w3.org/2000/svg", "g");
                        legendItem.setAttribute("transform", "translate(" + legendIndent + ", " + legendY + ")");
                        legendItem.style.cursor = "pointer";

                        var hitTarget = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                        hitTarget.setAttribute("x", "-15"); hitTarget.setAttribute("y", "-8");
                        hitTarget.setAttribute("width", state.inputTokenWidth - 5); hitTarget.setAttribute("height", "14");
                        hitTarget.setAttribute("fill", "transparent");
                        legendItem.appendChild(hitTarget);

                        var closeBtn = document.createElementNS("http://www.w3.org/2000/svg", "text");
                        closeBtn.setAttribute("class", "legend-close");
                        closeBtn.setAttribute("x", legendCloseX); closeBtn.setAttribute("y", "4");
                        closeBtn.style.fontSize = "var(--ll-title-size, 20px)"; closeBtn.setAttribute("fill", "#999");
                        closeBtn.style.display = "none";
                        closeBtn.textContent = "\u00d7";
                        legendItem.appendChild(closeBtn);

                        var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                        line.setAttribute("x1", "0"); line.setAttribute("y1", "0");
                        line.setAttribute("x2", 15 * fontScale); line.setAttribute("y2", "0");
                        line.setAttribute("stroke", group.color); line.setAttribute("stroke-width", strokeWidth);
                        legendItem.appendChild(line);

                        var clipId = uid + "_legend_clip_" + groupIdx;
                        var clipPath = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
                        clipPath.setAttribute("id", clipId);
                        var clipRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                        clipRect.setAttribute("x", 20 * fontScale); clipRect.setAttribute("y", -10 * fontScale);
                        clipRect.setAttribute("width", state.inputTokenWidth - 45 * fontScale); clipRect.setAttribute("height", 20 * fontScale);
                        clipPath.appendChild(clipRect);
                        legendItem.appendChild(clipPath);

                        var text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                        text.setAttribute("x", 20 * fontScale); text.setAttribute("y", legendTextY);
                        text.style.fontSize = "var(--ll-content-size, 14px)"; text.setAttribute("fill", isDarkMode() ? "#ddd" : "#333");
                        text.setAttribute("clip-path", "url(#" + clipId + ")");
                        text.textContent = groupLabel;
                        legendItem.appendChild(text);

                        legendItem.addEventListener("mouseenter", function() { closeBtn.style.display = "block"; });
                        legendItem.addEventListener("mouseleave", function() { closeBtn.style.display = "none"; });
                        closeBtn.addEventListener("click", function(e) {
                            e.stopPropagation();
                            state.pinnedGroups.splice(groupIdx, 1);
                            if (state.lastPinnedGroupIndex >= state.pinnedGroups.length) {
                                state.lastPinnedGroupIndex = state.pinnedGroups.length - 1;
                            }
                            buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
                        });

                        legendG.appendChild(legendItem);
                        legendY += legendEntryHeight;
                    });
                }

                // ─────────────────────────────────────────────────────────────
                // HOVER TRAJECTORY: Show comparison trajectory on hover
                // ─────────────────────────────────────────────────────────────
                if (hoverTrajectory && hoverLabel) {
                    drawSingleTrajectory(trajG, hoverTrajectory, hoverColor || "#999", maxValue, hoverLabel, true, chartInnerWidth, "", isRankMode);

                    var legendItem = document.createElementNS("http://www.w3.org/2000/svg", "g");
                    legendItem.setAttribute("class", "legend-item hover-legend");
                    legendItem.setAttribute("transform", "translate(" + legendIndent + ", " + legendY + ")");

                    var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                    line.setAttribute("x1", "0"); line.setAttribute("y1", "0");
                    line.setAttribute("x2", 15 * fontScale); line.setAttribute("y2", "0");
                    line.setAttribute("stroke", hoverColor || "#999");
                    line.setAttribute("stroke-width", strokeWidthHover);
                    line.setAttribute("stroke-dasharray", (4 * fontScale) + "," + (2 * fontScale));
                    line.style.opacity = "0.7";
                    legendItem.appendChild(line);

                    var clipId = uid + "_hover_clip";
                    var clipPath = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
                    clipPath.setAttribute("id", clipId);
                    var clipRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    clipRect.setAttribute("x", 20 * fontScale); clipRect.setAttribute("y", -10 * fontScale);
                    clipRect.setAttribute("width", state.inputTokenWidth - 45 * fontScale); clipRect.setAttribute("height", 20 * fontScale);
                    clipPath.appendChild(clipRect);
                    legendItem.appendChild(clipPath);

                    var text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    text.setAttribute("x", 20 * fontScale); text.setAttribute("y", legendTextY);
                    text.style.fontSize = "var(--ll-content-size, 14px)"; text.setAttribute("fill", isDarkMode() ? "#aaa" : "#666");
                    text.setAttribute("clip-path", "url(#" + clipId + ")");
                    text.textContent = visualizeSpaces(hoverLabel);
                    legendItem.appendChild(text);

                    legendG.appendChild(legendItem);
                }
            }

            function drawSingleTrajectory(g, trajectory, color, maxValue, label, isHover, chartInnerWidth, dashPattern, isRankMode) {
                if (!trajectory || trajectory.length === 0) return;

                var chartMargin = getChartMargin();
                var chartInnerHeight = getChartInnerHeight();
                // Scale dot radius and stroke width proportionally with font size
                var fontScale = getContentFontSizePx() / 10;
                var dotRadius = (isHover ? 2 : 3) * fontScale;
                var strokeWidth = (isHover ? 1.5 : 2) * fontScale;
                var labelMargin = chartMargin.right;
                var usableWidth = chartInnerWidth - labelMargin;
                function layerToX(layerIdx) {
                    if (nLayers <= 1) return usableWidth / 2;
                    var visibleLayerRange = (nLayers - 1) - state.plotMinLayer;
                    if (visibleLayerRange <= 0) return usableWidth / 2;
                    return dotRadius + ((layerIdx - state.plotMinLayer) / visibleLayerRange) * (usableWidth - 2 * dotRadius);
                }

                // Y-coordinate calculation:
                // - Probability mode: higher value = higher on chart (standard)
                // - Rank mode: rank 1 = top of chart, higher rank = lower on chart (inverted)
                function valueToY(value) {
                    if (value === null) return null;
                    if (isRankMode) {
                        // Rank: 1 = top (y=0), maxValue = bottom (y=chartInnerHeight)
                        return ((value - 1) / (maxValue - 1)) * chartInnerHeight;
                    } else {
                        // Probability: 0 = bottom, maxValue = top
                        return chartInnerHeight - (value / maxValue) * chartInnerHeight;
                    }
                }

                var pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
                if (isHover) pathEl.style.opacity = "0.7";

                var d = "";
                var firstPoint = true;
                trajectory.forEach(function(p, layerIdx) {
                    if (p === null) return;  // Skip null values in rank trajectories
                    var x = layerToX(layerIdx);
                    var y = valueToY(p);
                    if (y === null) return;
                    d += (firstPoint ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
                    firstPoint = false;
                });

                if (d) {
                    pathEl.setAttribute("d", d);
                    pathEl.setAttribute("fill", "none");
                    pathEl.setAttribute("stroke", color);
                    pathEl.setAttribute("stroke-width", strokeWidth);
                    // Use provided dash pattern (scaled), or default hover pattern
                    if (isHover) {
                        pathEl.setAttribute("stroke-dasharray", (4 * fontScale) + "," + (2 * fontScale));
                    } else if (dashPattern) {
                        // Scale the provided dash pattern
                        var scaledDash = dashPattern.split(",").map(function(v) { return parseFloat(v) * fontScale; }).join(",");
                        pathEl.setAttribute("stroke-dasharray", scaledDash);
                    }
                    g.appendChild(pathEl);
                }

                state.currentVisibleIndices.forEach(function(layerIdx) {
                    var p = trajectory[layerIdx];
                    if (p === null) return;  // Skip null values
                    var x = layerToX(layerIdx);
                    var y = valueToY(p);
                    if (y === null) return;

                    var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                    circle.setAttribute("cx", x.toFixed(1));
                    circle.setAttribute("cy", y.toFixed(1));
                    circle.setAttribute("r", dotRadius);
                    circle.setAttribute("fill", color);
                    if (isHover) circle.style.opacity = "0.7";

                    var title = document.createElementNS("http://www.w3.org/2000/svg", "title");
                    if (isRankMode) {
                        title.textContent = (label || "") + " L" + widgetData.layers[layerIdx] + ": rank " + p;
                    } else {
                        title.textContent = (label || "") + " L" + widgetData.layers[layerIdx] + ": " + (p * 100).toFixed(2) + "%";
                    }
                    circle.appendChild(title);
                    g.appendChild(circle);
                });
            }

            // Global event listeners

            dom.widget().addEventListener("mousedown", function(e) {
                if (e.shiftKey) e.preventDefault();
            });

            dom.widget().addEventListener("mouseleave", function() {
                state.currentHoverPos = widgetData.tokens.length - 1;
                var chartInnerWidth = updateChartDimensions();
                drawAllTrajectories(null, null, null, chartInnerWidth, state.currentHoverPos);
            });

            // Color picker handler
            var colorPicker = dom.colorPicker();
            colorPicker.addEventListener("input", function(e) {
                if (!state.colorPickerTarget) return;
                var newColor = e.target.value;
                if (state.colorPickerTarget.type === "trajectory") {
                    var group = state.pinnedGroups[state.colorPickerTarget.groupIdx];
                    if (group) {
                        group.color = newColor;
                        buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
                    }
                } else if (state.colorPickerTarget.type === "heatmap") {
                    state.heatmapBaseColor = newColor;
                    buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows);
                }
            });
            colorPicker.addEventListener("change", function() {
                state.colorPickerTarget = null;
            });

            // Bottom resize handle for truncating rows
            (function() {
                var handle = dom.resizeBottom();
                var table = dom.table();
                var isDragging = false, startY = 0, startMaxRows = null, measuredRowHeight = 20;

                handle.addEventListener("mousedown", function(e) {
                    closePopup();
                    isDragging = true;
                    startY = e.clientY;
                    startMaxRows = state.currentMaxRows;
                    // Measure actual row height from DOM (use second row to skip header)
                    var rows = table.querySelectorAll("tr");
                    if (rows.length >= 2) {
                        measuredRowHeight = rows[1].getBoundingClientRect().height;
                    }
                    handle.classList.add("dragging");
                    e.preventDefault();
                    e.stopPropagation();
                });

                document.addEventListener("mousemove", function(e) {
                    if (!isDragging) return;
                    var delta = e.clientY - startY;
                    var rowDelta = Math.round(delta / measuredRowHeight);

                    var totalTokens = widgetData.tokens.length;
                    var startRows = startMaxRows === null ? totalTokens : startMaxRows;
                    var newMaxRows = startRows + rowDelta;
                    newMaxRows = Math.max(1, Math.min(totalTokens, newMaxRows));
                    if (newMaxRows >= totalTokens) newMaxRows = null;

                    if (newMaxRows !== state.currentMaxRows) {
                        buildTable(state.currentCellWidth, state.currentVisibleIndices, newMaxRows);
                    }
                });

                document.addEventListener("mouseup", function() {
                    if (isDragging) {
                        isDragging = false;
                        handle.classList.remove("dragging");
                    }
                });
            })();

            // Right edge resize handle for table width
            (function() {
                var handle = dom.resizeRight();

                handle.addEventListener("mousedown", function(e) {
                    closePopup();
                    var table = dom.table();
                    state.rightEdgeDrag = {
                        active: true,
                        startX: e.clientX,
                        startTableWidth: table.offsetWidth,
                        startCellWidth: state.currentCellWidth,
                        hadMaxTableWidth: state.maxTableWidth !== null,
                        startMaxTableWidth: state.maxTableWidth
                    };
                    handle.classList.add("dragging");
                    e.preventDefault();
                    e.stopPropagation();
                });
            })();

            // Right edge drag handler
            document.addEventListener("mousemove", function(e) {
                if (!state.rightEdgeDrag.active) return;
                var delta = e.clientX - state.rightEdgeDrag.startX;
                var actualContainerWidth = getActualContainerWidth();
                var targetTableWidth = state.rightEdgeDrag.startTableWidth + delta;

                if (delta >= 0) {
                    // Dragging right - expand state.maxTableWidth and smoothly expand column width
                    // Don't exceed container width
                    targetTableWidth = Math.min(targetTableWidth, actualContainerWidth);

                    // Snap state.maxTableWidth to null when close to container, otherwise set it
                    if (targetTableWidth >= actualContainerWidth - state.currentCellWidth) {
                        state.maxTableWidth = null;
                    } else {
                        state.maxTableWidth = targetTableWidth;
                    }

                    // Calculate new cell width to achieve target table width
                    var availableForCells = targetTableWidth - state.inputTokenWidth - 1;
                    var numVisibleCols = state.currentVisibleIndices.length;
                    if (numVisibleCols > 0) {
                        var newCellWidth = availableForCells / numVisibleCols;

                        // If cell width exceeds max, add one more column and shrink to fit
                        if (newCellWidth > maxCellWidth && numVisibleCols < nLayers) {
                            numVisibleCols = numVisibleCols + 1;
                            newCellWidth = availableForCells / numVisibleCols;
                        }

                        newCellWidth = Math.max(minCellWidth, Math.min(maxCellWidth, newCellWidth));
                        // Use a small threshold relative to cell count for smooth dragging
                        var threshold = 0.5 / Math.max(1, numVisibleCols);
                        if (Math.abs(newCellWidth - state.currentCellWidth) > threshold) {
                            state.currentCellWidth = newCellWidth;
                            var result = computeVisibleLayers(state.currentCellWidth, getContainerWidth());
                            buildTable(state.currentCellWidth, result.indices, state.currentMaxRows, result.stride);
                            notifyLinkedWidgets();
                        }
                    }
                } else {
                    // Dragging left - introduce state.maxTableWidth constraint without changing column width
                    targetTableWidth = Math.max(state.inputTokenWidth + minCellWidth + 1, targetTableWidth);

                    // If user drags back to or past start and didn't have state.maxTableWidth, abort constraint
                    if (!state.rightEdgeDrag.hadMaxTableWidth && targetTableWidth >= state.rightEdgeDrag.startTableWidth) {
                        state.maxTableWidth = null;
                    } else {
                        state.maxTableWidth = targetTableWidth;
                    }

                    // Rebuild table with constraint (may introduce strides), keep column width unchanged
                    var result = computeVisibleLayers(state.currentCellWidth, getContainerWidth());
                    buildTable(state.currentCellWidth, result.indices, state.currentMaxRows, result.stride);
                    notifyLinkedWidgets();
                }
            });

            // ═══════════════════════════════════════════════════════════════
            // WIDGET LINKING AND STATE SERIALIZATION
            // ═══════════════════════════════════════════════════════════════

            function getColumnState() {
                return {
                    cellWidth: state.currentCellWidth,
                    inputTokenWidth: state.inputTokenWidth,
                    maxTableWidth: state.maxTableWidth
                };
            }

            function setColumnState(colState, fromSync) {
                if (state.isSyncing) return;  // Prevent loops
                var changed = false;

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
                    var result = computeVisibleLayers(state.currentCellWidth, getContainerWidth());
                    buildTable(state.currentCellWidth, result.indices, state.currentMaxRows, result.stride);

                    // Sync to linked widgets if this wasn't triggered by a sync
                    if (!fromSync) {
                        notifyLinkedWidgets();
                    }
                }
            }

            function notifyLinkedWidgets() {
                if (state.isSyncing) return;
                state.isSyncing = true;
                var colState = getColumnState();
                state.linkedWidgets.forEach(function(w) {
                    if (w.setColumnState) {
                        w.setColumnState(colState, true);
                    }
                });
                state.isSyncing = false;
            }

            // Function to get current UI state for serialization
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
                    pinnedRows: state.pinnedRows.map(function(pr) {
                        return { pos: pr.pos, line: pr.lineStyle.name };
                    }),
                    heatmapBaseColor: state.heatmapBaseColor,
                    heatmapNextColor: state.heatmapNextColor,
                    darkMode: state.darkModeOverride,
                    showHeatmap: state.showHeatmap,
                    showChart: state.showChart,
                    trajectoryMetric: state.trajectoryMetric
                };
            }

            // ═══════════════════════════════════════════════════════════════
            // DARK MODE
            // ═══════════════════════════════════════════════════════════════

            function applyDarkMode(enabled) {
                var widgetEl = dom.widget();
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

            // Initial build with container width
            var containerWidth = getContainerWidth();
            var result = computeVisibleLayers(state.currentCellWidth, containerWidth);
            buildTable(state.currentCellWidth, result.indices, state.currentMaxRows, result.stride);

            // Apply chart height to SVG element (use default if not explicitly set)
            var svg = dom.chart();
            if (svg) {
                svg.setAttribute("height", getActualChartHeight());
            }

            // Apply dark mode based on override or auto-detection
            applyDarkMode(isDarkMode());

            // Helper to get current font sizes from computed style
            function getCurrentFontSizes() {
                var widgetEl = dom.widget();
                if (!widgetEl) return { title: '', content: '' };
                var style = getComputedStyle(widgetEl);
                return {
                    title: style.getPropertyValue('--ll-title-size'),
                    content: style.getPropertyValue('--ll-content-size')
                };
            }

            // Watch for color-scheme and font size changes on ancestors
            var lastDetectedDarkMode = isDarkMode();
            var lastFontSizes = getCurrentFontSizes();
            var styleObserver = new MutationObserver(function() {
                // Stop if widget was removed from DOM
                var widgetEl = dom.widget();
                if (!widgetEl) {
                    styleObserver.disconnect();
                    return;
                }
                var needsRebuild = false;

                // Check dark mode (only if in auto-detect mode)
                if (state.darkModeOverride === null) {
                    var currentDarkMode = isDarkMode();
                    if (currentDarkMode !== lastDetectedDarkMode) {
                        lastDetectedDarkMode = currentDarkMode;
                        applyDarkMode(currentDarkMode);
                        needsRebuild = true;
                    }
                }

                // Check font sizes
                var currentFontSizes = getCurrentFontSizes();
                if (currentFontSizes.title !== lastFontSizes.title || currentFontSizes.content !== lastFontSizes.content) {
                    lastFontSizes = currentFontSizes;
                    needsRebuild = true;
                }

                if (needsRebuild) {
                    buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows, state.currentStride);
                }
            });
            // Observe document root for style/class changes
            styleObserver.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['style', 'class']
            });
            // Also observe body if it exists
            if (document.body) {
                styleObserver.observe(document.body, {
                    attributes: true,
                    attributeFilter: ['style', 'class']
                });
            }

            // ═══════════════════════════════════════════════════════════════
            // PUBLIC API
            // ═══════════════════════════════════════════════════════════════

            // Build the public interface object that will be returned
            // This same object is used for linking, so references are consistent
            var publicInterface = {
                uid: uid,
                getState: getState,
                getColumnState: getColumnState,
                setColumnState: setColumnState,
                linkColumnsTo: function(otherWidget) {
                    if (state.linkedWidgets.indexOf(otherWidget) < 0) {
                        state.linkedWidgets.push(otherWidget);
                    }
                    // Also link the other direction using our public interface
                    if (otherWidget.linkColumnsTo) {
                        var otherLinked = otherWidget._getLinkedWidgets ? otherWidget._getLinkedWidgets() : [];
                        if (otherLinked.indexOf(publicInterface) < 0) {
                            otherWidget.linkColumnsTo(publicInterface);
                        }
                    }
                    // Sync current state to the other widget
                    otherWidget.setColumnState(getColumnState(), true);
                },
                unlinkColumns: function(otherWidget) {
                    var idx = state.linkedWidgets.indexOf(otherWidget);
                    if (idx >= 0) {
                        state.linkedWidgets.splice(idx, 1);
                    }
                },
                _getLinkedWidgets: function() { return state.linkedWidgets; },
                setDarkMode: function(enabled) {
                    // null = auto-detect from CSS, true/false = override
                    state.darkModeOverride = enabled === null ? null : !!enabled;
                    applyDarkMode(isDarkMode());
                    // Rebuild table to apply new heatmap colors
                    buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows, state.currentStride);
                },
                getDarkMode: function() {
                    // Returns effective dark mode state (resolved from override or CSS)
                    return isDarkMode();
                },
                setFontSize: function(options) {
                    // Set font size overrides on the widget element
                    // options: { title: '18px', content: '12px' } or null to clear
                    var widgetEl = dom.widget();
                    if (!widgetEl) return;
                    if (options === null || (typeof options === 'object' && !options.title && !options.content)) {
                        // Clear overrides - remove inline custom properties
                        widgetEl.style.removeProperty('--ll-title-size');
                        widgetEl.style.removeProperty('--ll-content-size');
                    } else {
                        if (options.title) widgetEl.style.setProperty('--ll-title-size', options.title);
                        if (options.content) widgetEl.style.setProperty('--ll-content-size', options.content);
                    }
                    // Rebuild to apply changes
                    buildTable(state.currentCellWidth, state.currentVisibleIndices, state.currentMaxRows, state.currentStride);
                },
                getFontSize: function() {
                    // Returns current computed font sizes
                    var widgetEl = dom.widget();
                    if (!widgetEl) return { title: null, content: null };
                    var style = getComputedStyle(widgetEl);
                    return {
                        title: style.getPropertyValue('--ll-title-size').trim() || '20px',
                        content: style.getPropertyValue('--ll-content-size').trim() || '14px'
                    };
                },

                // ═══════════════════════════════════════════════════════════════
                // Event Emitter API
                // ═══════════════════════════════════════════════════════════════
                on: function(eventName, callback) {
                    addEventListener(eventName, callback);
                    return publicInterface;
                },
                off: function(eventName, callback) {
                    removeEventListener(eventName, callback);
                    return publicInterface;
                },

                // ═══════════════════════════════════════════════════════════════
                // Visibility Toggles
                // ═══════════════════════════════════════════════════════════════
                setShowHeatmap: function(show) {
                    state.showHeatmap = !!show;
                    render();
                    emitEvent('showHeatmap', state.showHeatmap);
                    return publicInterface;
                },
                getShowHeatmap: function() {
                    return state.showHeatmap;
                },
                setShowChart: function(show) {
                    state.showChart = !!show;
                    var chartContainer = dom.chartContainer();
                    if (chartContainer) {
                        chartContainer.style.display = state.showChart ? "block" : "none";
                    }
                    emitEvent('showChart', state.showChart);
                    return publicInterface;
                },
                getShowChart: function() {
                    return state.showChart;
                },

                // ═══════════════════════════════════════════════════════════════
                // Trajectory Metric API
                // ═══════════════════════════════════════════════════════════════
                setTrajectoryMetric: function(metric) {
                    if (metric === "probability" || metric === "rank") {
                        state.trajectoryMetric = metric;
                        var chartInnerWidth = updateChartDimensions();
                        drawAllTrajectories(null, null, null, chartInnerWidth, state.currentHoverPos);
                        emitEvent('trajectoryMetric', metric);
                    }
                    return publicInterface;
                },
                getTrajectoryMetric: function() {
                    return state.trajectoryMetric;
                },

                // ═══════════════════════════════════════════════════════════════
                // Title API
                // ═══════════════════════════════════════════════════════════════
                setTitle: function(title) {
                    state.customTitle = title || "";
                    updateTitle();
                    emitEvent('title', state.customTitle);
                    return publicInterface;
                },
                getTitle: function() {
                    return state.customTitle;
                },

                // ═══════════════════════════════════════════════════════════════
                // Color Mode API
                // ═══════════════════════════════════════════════════════════════
                setColorModes: function(modes) {
                    if (!Array.isArray(modes)) {
                        modes = modes ? [modes] : [];
                    }
                    state.colorModes = modes.slice();
                    render();
                    emitEvent('colorModes', state.colorModes.slice());
                    return publicInterface;
                },
                getColorModes: function() {
                    return state.colorModes.slice();
                },
                addColorMode: function(mode) {
                    if (state.colorModes.indexOf(mode) === -1) {
                        state.colorModes.push(mode);
                        render();
                        emitEvent('colorModes', state.colorModes.slice());
                    }
                    return publicInterface;
                },
                removeColorMode: function(mode) {
                    var idx = state.colorModes.indexOf(mode);
                    if (idx >= 0) {
                        state.colorModes.splice(idx, 1);
                        render();
                        emitEvent('colorModes', state.colorModes.slice());
                    }
                    return publicInterface;
                },

                // ═══════════════════════════════════════════════════════════════
                // Row/Group Manipulation API
                // ═══════════════════════════════════════════════════════════════
                togglePinnedRow: function(pos) {
                    if (pos < 0 || pos >= nPositions) return publicInterface;
                    var wasPinned = findPinnedRow(pos) >= 0;
                    togglePinnedRow(pos);
                    render();
                    emitEvent('pinnedRows', publicInterface.getPinnedRows());
                    return publicInterface;
                },
                getPinnedRows: function() {
                    return state.pinnedRows.map(function(pr) {
                        return { pos: pr.pos, line: pr.lineStyle.name };
                    });
                },
                setPinnedRows: function(rows) {
                    state.pinnedRows = rows.map(function(r) {
                        var style = lineStyles.find(function(ls) { return ls.name === r.line; }) || lineStyles[0];
                        return { pos: r.pos, lineStyle: style };
                    });
                    render();
                    emitEvent('pinnedRows', publicInterface.getPinnedRows());
                    return publicInterface;
                },
                getPinnedGroups: function() {
                    return JSON.parse(JSON.stringify(state.pinnedGroups));
                },
                setPinnedGroups: function(groups) {
                    state.pinnedGroups = JSON.parse(JSON.stringify(groups));
                    render();
                    emitEvent('pinnedGroups', publicInterface.getPinnedGroups());
                    return publicInterface;
                },
                pinToken: function(token, options) {
                    options = options || {};
                    var existingIdx = findGroupForToken(token);
                    if (existingIdx >= 0) return publicInterface;

                    var color = options.color || getNextColor();
                    var newGroup = { color: color, tokens: [token] };
                    state.pinnedGroups.push(newGroup);
                    state.lastPinnedGroupIndex = state.pinnedGroups.length - 1;
                    render();
                    emitEvent('pinnedGroups', publicInterface.getPinnedGroups());
                    return publicInterface;
                },
                unpinToken: function(token) {
                    var groupIdx = findGroupForToken(token);
                    if (groupIdx < 0) return publicInterface;

                    var group = state.pinnedGroups[groupIdx];
                    group.tokens = group.tokens.filter(function(t) { return t !== token; });
                    if (group.tokens.length === 0) {
                        state.pinnedGroups.splice(groupIdx, 1);
                    }
                    render();
                    emitEvent('pinnedGroups', publicInterface.getPinnedGroups());
                    return publicInterface;
                },

                // ═══════════════════════════════════════════════════════════════
                // Hover Synchronization API
                // ═══════════════════════════════════════════════════════════════
                hoverRow: function(pos) {
                    if (pos === null || pos === undefined) {
                        return publicInterface.clearHover();
                    }
                    if (pos < 0 || pos >= nPositions) return publicInterface;
                    state.currentHoverPos = pos;
                    var chartInnerWidth = updateChartDimensions();
                    var bestToken = findHighestProbToken(pos, 2, 0.05);
                    if (bestToken && findGroupForToken(bestToken) < 0) {
                        var traj = getTrajectoryForToken(bestToken, pos);
                        drawAllTrajectories(traj, "#999", bestToken, chartInnerWidth, pos);
                    } else {
                        drawAllTrajectories(null, null, null, chartInnerWidth, pos);
                    }
                    emitEvent('hover', pos);
                    return publicInterface;
                },
                clearHover: function() {
                    state.currentHoverPos = nPositions - 1;
                    var chartInnerWidth = updateChartDimensions();
                    drawAllTrajectories(null, null, null, chartInnerWidth, state.currentHoverPos);
                    emitEvent('hover', null);
                    return publicInterface;
                },
                getHoveredRow: function() {
                    return state.currentHoverPos;
                },

                // ═══════════════════════════════════════════════════════════════
                // Data Capability Detection
                // ═══════════════════════════════════════════════════════════════
                hasEntropyData: hasEntropyData,
                hasRankData: hasRankData,
                isTokenTracked: function(token, pos) {
                    if (pos < 0 || pos >= nPositions) return false;
                    return isTokenTracked(token, pos);
                }
            };

            return publicInterface;
        })();

        return widgetInterface;
    };
})();
