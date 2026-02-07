/**
 * Activation Patching Types
 * Types for the activation patching visualization tool
 */

/**
 * Configuration data for activation patching
 */
export interface ActivationPatchingConfigData {
    model: string;
    srcPrompt: string;
    tgtPrompt: string;
    srcPos: number[];  // Selected token positions in source prompt
    tgtPos: number[];  // Selected token positions in target prompt (must match srcPos length)
    selectedLineIndices?: number[];  // Indices of lines to display in the chart
}

/**
 * Activation Patching visualization data returned from backend
 * Contains probability trajectories for tracked tokens across layers
 */
export interface ActivationPatchingData {
    lines: number[][];  // Each line is [prob_layer_0, prob_layer_1, ...] for a tracked token
    ranks: number[][];  // Each line is [rank_layer_0, rank_layer_1, ...] for a tracked token
    tokenLabels?: string[];  // Optional labels for the lines (e.g., token text)
}

/**
 * API request format for activation patching endpoint
 */
export interface ActivationPatchingApiRequest {
    model_name: string;
    src_prompt: string;
    tgt_prompt: string;
    src_pos: number[];  // List of source token positions
    tgt_pos: number[];  // List of target token positions (must match src_pos length)
    token_ids: number[];  // Token IDs to track
}
