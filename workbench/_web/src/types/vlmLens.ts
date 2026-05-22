/**
 * VLM Logit Lens Types
 *
 * Mirrors workbench/_api/routes/vlm_lens.py's VLMLensData / VLMLensMeta.
 * The viewer is hand-rolled (not the nnsightful LogitLensWidget) because
 * the data is image-tied — patches, per-position labels including <IMGxxx>,
 * etc.
 */

export interface VlmLensConfigData {
    model: string;
    prompt: string;
    topK?: number; // default 5
    // The image itself is NOT persisted in the config — it lives in
    // useVlmLensImage (zustand, in-memory, keyed by chartId).
    imageFilename?: string; // last-uploaded filename, for display only
}

export interface VlmLensMeta {
    version: number;
    timestamp: string;
    model: string;
    prompt: string;
}

/**
 * Wire payload returned by /vlm_lens/results and persisted in charts.data.
 *
 * topk[layer][position] -> list of [token_str, "%.4f" % prob] of length top_k.
 * input_tokens length === topk[*][i].length === seq_len; the single
 * <image> placeholder is pre-expanded to <IMGxxx> labels.
 */
export interface VlmLensData {
    meta: VlmLensMeta;
    input_tokens: string[];
    num_layers: number;
    image_size: number; // CLIP processor size, e.g. 336
    patch_size: number; // e.g. 14
    num_image_tokens: number; // = (image_size / patch_size) ** 2 = 576 for llava-1.5
    topk: [string, string][][][]; // [layer][pos][k] = [token, "prob"]
}
