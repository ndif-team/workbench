/**
 * CSS styles for LogitLensWidget
 */

/**
 * Generate scoped CSS for a widget instance
 */
export function generateStyles(uid: string): string {
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

/**
 * Generate HTML structure for a widget instance
 */
export function generateHTML(uid: string): string {
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
