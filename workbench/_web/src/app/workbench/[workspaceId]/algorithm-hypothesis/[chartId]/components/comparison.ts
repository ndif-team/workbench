"use client";

import { useMemo } from "react";
import type { AlgorithmDefinition } from "@/types/algorithmHypothesis";
import { sameDefinition, upgradeDefinition } from "@/lib/algorithmHypothesis/engine";
import { tokenizeAbstract } from "@/lib/algorithmHypothesis/grids";
import { useSavedAlgorithms } from "@/lib/api/algorithmApi";

/** One algorithm the intervention and sweep views run alongside this one. */
export interface ComparedAlgorithm {
    key: string;
    name: string;
    group: "this" | "saved";
    note?: string;
    definition: AlgorithmDefinition;
    /** Template tokens; a custom function's `template` parameter reads them. */
    templateTokens: string[];
}

/**
 * This algorithm (its working copy) and the saved version of every other saved
 * algorithm in the workspace on the same grid.
 */
export function useComparedAlgorithms({
    workspaceId,
    algorithmId,
    definition,
    savedDefinition,
    templateTokens,
    enabled = true,
}: {
    workspaceId: string;
    algorithmId: string;
    definition: AlgorithmDefinition;
    savedDefinition: AlgorithmDefinition | null;
    templateTokens: string[];
    enabled?: boolean;
}): ComparedAlgorithm[] {
    const { data: saved } = useSavedAlgorithms(workspaceId, enabled);
    return useMemo(() => {
        const sameGrid = (d: AlgorithmDefinition) =>
            d.grid.kind === definition.grid.kind &&
            d.grid.layers === definition.grid.layers &&
            d.grid.model === definition.grid.model;
        const unsaved = !savedDefinition
            ? "this algorithm, not saved yet"
            : sameDefinition(savedDefinition, definition)
              ? "this algorithm"
              : "this algorithm, unsaved changes";
        const out: ComparedAlgorithm[] = [
            {
                key: "this",
                name: definition.name,
                group: "this",
                note: unsaved,
                definition,
                templateTokens,
            },
        ];
        for (const row of saved ?? []) {
            if (row.id === algorithmId) continue;
            const d = upgradeDefinition(row.definition);
            if (!sameGrid(d) || !d.output) continue;
            // Abstract templates tokenize here; a model grid's other templates
            // would need the tokenizer, so they reuse this one's.
            const template =
                d.grid.kind === "abstract" ? tokenizeAbstract(d.template) : templateTokens;
            out.push({
                key: row.id,
                name: d.name,
                group: "saved",
                definition: d,
                templateTokens: template,
            });
        }
        return out;
    }, [saved, algorithmId, definition, savedDefinition, templateTokens]);
}
