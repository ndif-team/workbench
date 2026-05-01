"use client";

import { generateBranchingAlternate } from "@/actions/workshop";
import { TrajectoryComparison } from "@/components/branching/TrajectoryComparison";
import type { BranchingDrillDown, BranchingGenerationSet } from "@/types/workshop";

interface WorkshopBranchingPanelProps {
    payload: BranchingGenerationSet;
}

/**
 * Workshop-mode wrapper around TrajectoryComparison. Wires "Generate full
 * alternate trajectory" to the live POST /branching/continue endpoint via the
 * workshop server action — anonymous via X-Workshop-Session.
 */
export function WorkshopBranchingPanel({ payload }: WorkshopBranchingPanelProps) {
    const handleGenerate = async (input: {
        sampleIdx: number;
        position: number;
        forcedTokenId: number;
        forcedTokenText: string;
    }): Promise<BranchingDrillDown> => {
        const sample = payload.samples[input.sampleIdx];
        const prefixIds = sample.completion_tokens
            .slice(0, input.position)
            .map((t) => t.id);
        return await generateBranchingAlternate({
            model: payload.model,
            prompt: payload.prompt,
            sample_idx: input.sampleIdx,
            branch_position: input.position,
            prefix_token_ids: prefixIds,
            forced_next_token_id: input.forcedTokenId,
            forced_next_token_text: input.forcedTokenText,
            max_tokens: 60,
        });
    };

    return <TrajectoryComparison payload={payload} generateAlternate={handleGenerate} />;
}
