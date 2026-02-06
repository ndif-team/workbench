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
    srcPos: number | null;  // Selected token position in source prompt
    tgtPos: number | null;  // Selected token position in target prompt
}

/**
 * Activation Patching visualization data returned from backend
 * Contains probability trajectories for tracked tokens across layers
 */
export interface ActivationPatchingData {
    lines: number[][];  // Each line is [prob_layer_0, prob_layer_1, ...] for a tracked token
    tokenLabels?: string[];  // Optional labels for the lines (e.g., token text)
}

/**
 * API request format for activation patching endpoint
 */
export interface ActivationPatchingApiRequest {
    model_name: string;
    src_prompt: string;
    tgt_prompt: string;
    src_pos: number;
    tgt_pos: number;
    token_ids: number[];  // Token IDs to track
}
