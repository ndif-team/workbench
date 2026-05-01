/**
 * Researcher-mode Branching Generations chart config + data shapes.
 * Mirrors the SamplingSpec schema at workbench/_api/routes/branching_models.py.
 */

import type { BranchingDrillDown, BranchingSample } from "@/types/workshop";

export interface BranchingSamplingSpec {
    temperature: number;
    seed: number;
    top_p?: number;
}

export interface BranchingConfigData {
    prompt: string;
    model: string;
    samples: BranchingSamplingSpec[];
    max_tokens: number;
    top_k: number;
}

export interface BranchingChartData {
    /** Last generated samples (3-5 panels). */
    samples: BranchingSample[];
    /** User-driven alternates from drill-downs. */
    drill_downs: BranchingDrillDown[];
}
