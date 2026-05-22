/**
 * Token-to-color helpers shared by the VLM-lens segmentation widget and
 * the legend. Same djb2-based HSLA hash as the standalone HTML viewer in
 * CVPR2026-HOW/lens/logit_lens.py so the colors don't reshuffle when the
 * layer slider moves.
 */

export const SEG_ALPHA = 0.8;
export const EMPTY_TOKEN = "<EMPTY>";

export function defaultColor(token: string): string {
    let h = 5381 | 0;
    for (let i = 0; i < token.length; i++) {
        h = ((h << 5) + h + token.charCodeAt(i)) | 0;
    }
    const hue = Math.abs(h) % 360;
    const sat = 60 + (Math.abs(h >> 8) % 30); // 60..89
    const lig = 45 + (Math.abs(h >> 16) % 20); // 45..64
    return `hsla(${hue}, ${sat}%, ${lig}%, ${SEG_ALPHA})`;
}

export function tokenColor(
    token: string,
    overrides: Record<string, string>,
): string {
    if (token === EMPTY_TOKEN) return `rgba(255, 255, 255, ${SEG_ALPHA})`;
    return overrides[token] ?? defaultColor(token);
}

export function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Render any CSS color into a #rrggbb hex string by rasterizing a single
 * pixel. Used to seed <input type="color"> picker values, which only
 * accept hex.
 */
let _probe: HTMLCanvasElement | null = null;
let _probeCtx: CanvasRenderingContext2D | null = null;
export function colorToHex(cssColor: string): string {
    if (typeof window === "undefined") return "#888888";
    if (!_probe) {
        _probe = document.createElement("canvas");
        _probe.width = _probe.height = 1;
        _probeCtx = _probe.getContext("2d");
    }
    if (!_probeCtx) return "#888888";
    _probeCtx.clearRect(0, 0, 1, 1);
    _probeCtx.fillStyle = cssColor;
    _probeCtx.fillRect(0, 0, 1, 1);
    const [r, g, b] = _probeCtx.getImageData(0, 0, 1, 1).data;
    const hex = (v: number) => v.toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * Whichever top-1 token at (layer, pos) survives the threshold; below
 * threshold becomes <EMPTY>. topk[layer][pos][0] = [tokenStr, probStr].
 */
export function effectiveToken(
    topk: [string, string][][][],
    layer: number,
    pos: number,
    threshold: number,
): string {
    const pair = topk[layer]?.[pos]?.[0];
    if (!pair) return EMPTY_TOKEN;
    const prob = parseFloat(pair[1]);
    return prob < threshold ? EMPTY_TOKEN : pair[0];
}
