/**
 * Shared helpers for rendering model tokens as readable, hover-highlightable
 * text — the same treatment the logit-lens prompt area uses. Used by the lens
 * controls and the generation panel's token view.
 */

/**
 * Escape control characters so whitespace/newline tokens are visible as literal
 * text (e.g. a newline token reads as `\n`), and report how many real newlines
 * to re-emit *after* the token span so the text still wraps naturally.
 */
export function fixTokenText(text: string): { result: string; numNewlines: number } {
    const numNewlines = (text.match(/\n/g) || []).length;
    const result = text
        .replace(/\r\n/g, "\\r\\n")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
    return { result, numNewlines };
}

/** Per-token hover highlight that reveals each token's boundary. */
export const TOKEN_HOVER =
    "hover:bg-primary/20 hover:ring-1 hover:ring-primary/30 hover:ring-inset";
