/**
 * Utility functions for LogitLensWidget
 */

import type { DOMHelpers, ChartMargin } from "./types";

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Round probability to a nice value for chart y-axis scale
 */
export function niceMax(p: number): number {
  if (p >= 0.95) return 1.0;
  const niceValues = [0.003, 0.005, 0.01, 0.02, 0.03, 0.05, 0.1, 0.2, 0.3, 0.5, 1.0];
  for (const v of niceValues) {
    if (p <= v) return v;
  }
  return 1.0;
}

/**
 * Format probability as percentage string with minimal digits
 */
export function formatPct(p: number): string {
  const pct = p * 100;
  if (pct >= 1) return Math.round(pct) + "%";
  if (pct >= 0.1) return pct.toFixed(1) + "%";
  return pct.toFixed(2) + "%";
}

/**
 * Normalize token for comparison (remove spaces/punctuation, lowercase)
 */
export function normalizeForComparison(token: string): string {
  return token.replace(/[\s.,!?;:'"()\[\]{}\-_]/g, "").toLowerCase();
}

/**
 * Check if topk list has similar tokens (same normalized form)
 */
export function hasSimilarTokensInList(
  topkList: { token: string }[],
  targetToken: string
): boolean {
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

/**
 * Map of invisible/special characters to their entity names
 */
const INVISIBLE_ENTITY_MAP: Record<string, string> = {
  "\u00A0": "&nbsp;", // Non-breaking space
  "\u00AD": "&shy;", // Soft hyphen
  "\u200B": "&#8203;", // Zero-width space
  "\u200C": "&zwnj;", // Zero-width non-joiner
  "\u200D": "&zwj;", // Zero-width joiner
  "\uFEFF": "&#65279;", // Zero-width no-break space (BOM)
  "\u2060": "&#8288;", // Word joiner
  "\u2002": "&ensp;", // En space
  "\u2003": "&emsp;", // Em space
  "\u2009": "&thinsp;", // Thin space
  "\u200A": "&#8202;", // Hair space
  "\u2006": "&#8198;", // Six-per-em space
  "\u2008": "&#8200;", // Punctuation space
  "\u200E": "&lrm;", // Left-to-right mark
  "\u200F": "&rlm;", // Right-to-left mark
  "\t": "&#9;", // Tab
  "\n": "&#10;", // Newline
  "\r": "&#13;", // Carriage return
};

/**
 * Visualize spaces in text for display
 */
export function visualizeSpaces(text: string, spellOutEntities = false): string {
  let result = text;

  // If spellOutEntities is true, convert invisible chars to entity names FIRST
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

  // Then convert leading/trailing spaces to modifier letter shelf
  let leadingSpaces = 0;
  while (leadingSpaces < result.length && result[leadingSpaces] === " ") {
    leadingSpaces++;
  }
  if (leadingSpaces > 0) {
    result = "\u02FD".repeat(leadingSpaces) + result.slice(leadingSpaces);
  }

  let trailingSpaces = 0;
  while (
    trailingSpaces < result.length &&
    result[result.length - 1 - trailingSpaces] === " "
  ) {
    trailingSpaces++;
  }
  if (trailingSpaces > 0) {
    result =
      result.slice(0, result.length - trailingSpaces) +
      "\u02FD".repeat(trailingSpaces);
  }

  return result;
}

/**
 * Create DOM helpers for a widget instance
 */
export function createDOMHelpers(uid: string): DOMHelpers {
  return {
    widget: () => document.getElementById(uid),
    table: () => document.getElementById(uid + "_table") as HTMLTableElement | null,
    chart: () => document.getElementById(uid + "_chart") as SVGElement | null,
    popup: () => document.getElementById(uid + "_popup"),
    popupClose: () => document.getElementById(uid + "_popup_close"),
    popupLayer: () => document.getElementById(uid + "_popup_layer"),
    popupPos: () => document.getElementById(uid + "_popup_pos"),
    popupContent: () => document.getElementById(uid + "_popup_content"),
    colorMenu: () => document.getElementById(uid + "_color_menu"),
    colorBtn: () => document.getElementById(uid + "_color_btn"),
    colorPicker: () =>
      document.getElementById(uid + "_color_picker") as HTMLInputElement | null,
    title: () => document.getElementById(uid + "_title"),
    titleText: () => document.getElementById(uid + "_title_text"),
    overlay: () => document.getElementById(uid + "_overlay"),
    resizeHint: () => document.getElementById(uid + "_resize_hint"),
    resizeBottom: () => document.getElementById(uid + "_resize_bottom"),
    resizeRight: () => document.getElementById(uid + "_resize_right"),
    chartContainer: () => document.getElementById(uid + "_chart_container"),
    tableWrapper: () => document.getElementById(uid)?.querySelector(".table-wrapper") as HTMLElement | null,
  };
}

/**
 * Get content font size in pixels from CSS variable
 */
export function getContentFontSizePx(dom: DOMHelpers): number {
  const widgetEl = dom.widget();
  if (!widgetEl) return 14;
  const style = getComputedStyle(widgetEl);
  const sizeStr = style.getPropertyValue("--ll-content-size").trim() || "14px";
  const match = sizeStr.match(/^([\d.]+)px$/);
  return match ? parseFloat(match[1]) : 14;
}

/**
 * Get dynamic chart margins that scale with font size
 */
export function getChartMargin(dom: DOMHelpers): ChartMargin {
  const fontSize = getContentFontSizePx(dom);
  return {
    top: Math.max(10, fontSize * 1.2),
    right: 8,
    bottom: Math.max(25, fontSize * 1.5),
    left: 10,
  };
}

/**
 * Get default chart height based on table row height
 */
export function getDefaultChartHeight(dom: DOMHelpers): number {
  const fontSize = getContentFontSizePx(dom);
  const topMargin = Math.max(10, fontSize * 1.2);
  const bottomMargin = Math.max(25, fontSize * 1.5);

  // Try to measure actual row height from table
  const table = dom.table();
  let rowHeight = fontSize * 2; // fallback estimate
  if (table) {
    const rows = table.querySelectorAll("tr");
    if (rows.length >= 2) {
      rowHeight = rows[1].getBoundingClientRect().height || rowHeight;
    }
  }

  // Chart inner area = ~6 table rows worth of height
  const innerHeight = rowHeight * 6;
  return topMargin + innerHeight + bottomMargin;
}
