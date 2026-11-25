/**
 * Activation Patching Types
 * Types for the activation patching visualization tool
 */

import type { LinePlotSection } from "nnsightful";

/**
 * A source position can be either:
 * - A single token index (number)
 * - A range of tokens [startIndex, endIndex] (tuple) - activations are averaged
 */
export type SourcePosition = number | [number, number];

/**
 * How much of what a looped model (`Model.looped`) holds at a token a patch
 * replaces at a layer visit. Such a model keeps several tensors per token
 * where other models keep one:
 * - "full_state": everything the visit leaves, with the copy of the pre-loop
 *   state that later passes restart from
 * - "live_state": what the visit's pass is working with, without that copy
 * - "active_block": only what the visit's layer returns
 * These are nnsightful's `LoopedActivationPatchingTool.PATCHES`. Other models'
 * patching has one form and takes no such option.
 */
export type LoopedPatch = "full_state" | "live_state" | "active_block";

/** The patch a looped model's run uses when none is picked, as in nnsightful. */
export const DEFAULT_LOOPED_PATCH: LoopedPatch = "full_state";

/**
 * Configuration data for activation patching
 */
export interface ActivationPatchingConfigData {
    model: string;
    srcPrompt: string;
    tgtPrompt: string;
    srcPos: SourcePosition[]; // Selected token positions in source prompt (can include ranges)
    tgtPos: number[]; // Selected token positions in target prompt (must match srcPos length)
    tgtFreeze: number[]; // Token positions in target prompt to freeze (keep clean activations)
    patch?: LoopedPatch; // Looped models only; unset on any other model
    selectedLineIndices?: number[]; // Indices of lines to display in the chart
    selectedMode?: string; // Display mode: "probability" | "rank" | "prob_diff"
}

/**
 * Activation Patching visualization data returned from backend
 * Contains probability trajectories for tracked tokens across layers
 */
export interface ActivationPatchingData {
    lines: number[][]; // Each line is [prob_layer_0, prob_layer_1, ...] for a tracked token
    ranks: number[][]; // Each line is [rank_layer_0, rank_layer_1, ...] for a tracked token
    prob_diffs: number[][]; // Each line is [prob_diff_layer_0, prob_diff_layer_1, ...] (patched - clean)
    tokenLabels?: string[]; // Optional labels for the lines (e.g., token text)
    /** Spans of the layer axis the plot marks as bands: a looped model's
     *  prelude, passes and coda (nnsightful's `LinePlotSection`). */
    sections?: LinePlotSection[] | null;
}

/**
 * API request format for activation patching endpoint
 */
export interface ActivationPatchingApiRequest {
    model_name: string;
    src_prompt: string;
    tgt_prompt: string;
    src_pos: SourcePosition[]; // List of source token positions (can include ranges)
    tgt_pos: number[]; // List of target token positions (must match src_pos length)
    tgt_freeze: number[]; // Token positions in target prompt to freeze
    token_ids: number[]; // Token IDs to track
    patch?: LoopedPatch; // Sent for looped models only
}
