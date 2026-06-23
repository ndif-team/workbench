/**
 * Shared formatting helpers for the cm-intro prompt-history UI. Single source so
 * the rail strips, the compare overlay, and any future history surface render
 * probabilities and model names identically.
 */

/** Probability → on-brand blue (matches the rail strips). 0 ≈ faint, 1 ≈ saturated. */
export function probColor(prob: number): string {
    const p = Math.max(0, Math.min(1, prob));
    return `hsl(217 91% ${96 - p * 46}%)`;
}

/** Drop the org prefix: "meta-llama/Llama-3.1-8B" → "Llama-3.1-8B". */
export function shortModelName(model: string): string {
    return model.split("/").pop() || model;
}
