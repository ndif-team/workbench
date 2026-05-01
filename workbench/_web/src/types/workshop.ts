/**
 * Workshop pre-cached payload types — wire format from `/examples/{id}`.
 * Mirrors workbench/_api/data_models.py.
 */

export interface WorkshopToken {
    idx: number;
    id: number;
    text: string;
    targetIds: number[];
}

export interface TopKLogit {
    token_id: number;
    token_text: string;
    probability: number;
}

export interface BranchingSample {
    temperature: number;
    seed: number;
    completion_text: string;
    completion_tokens: WorkshopToken[];
    per_position_top_k: TopKLogit[][];
}

export interface BranchingDrillDown {
    sample_idx: number;
    branch_position: number;
    forced_token_id: number;
    forced_token_text: string;
    continuation_text: string;
    continuation_tokens: WorkshopToken[];
    per_position_top_k: TopKLogit[][];
}

export interface BranchingGenerationSet {
    record_type: "branching_generation_set";
    example_id: string;
    prompt: string;
    model: string;
    max_tokens: number;
    samples: BranchingSample[];
    drill_downs: BranchingDrillDown[];
    critical_framing_prompt?: string | null;
    pedagogical_narrative?: string | null;
    risk_flag?: string | null;
}

export interface CommitmentStripPayload {
    record_type: "commitment_strip";
    example_id: string;
    prompt: string;
    completion_text: string;
    completion_tokens: WorkshopToken[];
    model: string;
    num_layers: number;
    /** [position][layer][topk_idx] */
    per_position_per_layer_top_k: TopKLogit[][][];
    critical_framing_prompt?: string | null;
    pedagogical_narrative?: string | null;
    risk_flag?: string | null;
}

export interface PromptTokenAttribution {
    prompt_position: number;
    prompt_token_text: string;
    score: number;
}

export interface PromptInfluencePayload {
    record_type: "prompt_influence";
    example_id: string;
    prompt: string;
    completion_text: string;
    completion_tokens: WorkshopToken[];
    target_output_position: number;
    method: "attention_rollup" | "integrated_gradients" | "attribution_patching";
    attributions: PromptTokenAttribution[];
    critical_framing_prompt?: string | null;
    pedagogical_narrative?: string | null;
    risk_flag?: string | null;
}

export type WorkshopExamplePayload =
    | BranchingGenerationSet
    | CommitmentStripPayload
    | PromptInfluencePayload;
