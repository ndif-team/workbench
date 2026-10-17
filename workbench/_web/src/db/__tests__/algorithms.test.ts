/**
 * Integration tests for Algorithm Hypothesis persistence on SQLite: the
 * algorithms table, chart creation (a chart points at a new blank algorithm),
 * and chart copies getting their own algorithm.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { clearDatabase } from "../client";
import {
    createAlgorithm,
    duplicateAlgorithm,
    getAlgorithmById,
    getAlgorithmsForWorkspace,
    getSavedAlgorithmsForWorkspace,
    saveAlgorithmVersion,
    updateAlgorithm,
} from "@/lib/queries/algorithmQueries";
import {
    copyChart,
    createAlgorithmHypothesisChartPair,
    getConfigForChart,
} from "@/lib/queries/chartQueries";
import { blankAlgorithm } from "@/lib/algorithmHypothesis/grids";
import type {
    AlgorithmDefinition,
    AlgorithmHypothesisChartData,
} from "@/types/algorithmHypothesis";

const WS = "ws-algorithms";

describe("algorithms", () => {
    beforeEach(async () => {
        await clearDatabase();
    });

    it("saves a complete version that later edits don't change", async () => {
        const draft = await createAlgorithm(WS, blankAlgorithm("Positional"));
        await createAlgorithm(WS, blankAlgorithm("Still a draft"));
        expect(await getSavedAlgorithmsForWorkspace(WS)).toEqual([]);

        const v1: AlgorithmDefinition = { ...blankAlgorithm("Positional"), template: "Ann loves ale." };
        const saved = await saveAlgorithmVersion(draft.id, v1);
        expect(saved?.savedDefinition).toEqual(v1);
        expect(saved?.savedAt).toBeInstanceOf(Date);

        // Autosaving the working copy leaves the saved version alone.
        await updateAlgorithm(draft.id, { ...v1, template: "Joe loves jam." });
        const list = await getSavedAlgorithmsForWorkspace(WS);
        expect(list.map((r) => r.id)).toEqual([draft.id]);
        expect(list[0].definition.template).toBe("Ann loves ale.");
        const items = await getAlgorithmsForWorkspace(WS);
        expect(items.find((r) => r.id === draft.id)?.savedAt).toBeInstanceOf(Date);
        expect(items.find((r) => r.id !== draft.id)?.savedAt).toBeNull();
    });

    it("creates, reads, updates and lists", async () => {
        const row = await createAlgorithm(WS, blankAlgorithm("Positional"));
        expect(row.name).toBe("Positional");
        expect((await getAlgorithmById(row.id))?.definition).toEqual(blankAlgorithm("Positional"));

        const next: AlgorithmDefinition = {
            ...blankAlgorithm("Renamed"),
            template: "Ann loves ale.",
        };
        await updateAlgorithm(row.id, next);
        const read = await getAlgorithmById(row.id);
        expect(read?.name).toBe("Renamed");
        expect((read?.definition as AlgorithmDefinition).template).toBe("Ann loves ale.");

        await createAlgorithm("other-workspace", blankAlgorithm("Elsewhere"));
        const list = await getAlgorithmsForWorkspace(WS);
        expect(list.map((a) => a.name)).toEqual(["Renamed"]);
    });

    it("duplicates into the same workspace", async () => {
        const row = await createAlgorithm(WS, blankAlgorithm("Lexical"));
        const copy = await duplicateAlgorithm(row.id);
        expect(copy?.id).not.toBe(row.id);
        expect(copy?.workspaceId).toBe(WS);
        expect(copy?.name).toBe("Copy of Lexical");
    });

    it("a new chart points at a new blank algorithm", async () => {
        const { chart } = await createAlgorithmHypothesisChartPair(WS);
        expect(chart.type).toBe("algorithm-hypothesis");
        expect((await getConfigForChart(chart.id))?.type).toBe("algorithm-hypothesis");
        const data = chart.data as AlgorithmHypothesisChartData;
        const algorithm = await getAlgorithmById(data.algorithmId);
        expect(algorithm?.workspaceId).toBe(WS);
        expect((algorithm?.definition as AlgorithmDefinition).variables).toEqual([]);
    });

    it("a copied chart gets its own algorithm", async () => {
        const { chart } = await createAlgorithmHypothesisChartPair(WS);
        const copy = await copyChart(chart.id);
        const original = (chart.data as AlgorithmHypothesisChartData).algorithmId;
        const copied = (copy.data as AlgorithmHypothesisChartData).algorithmId;
        expect(copied).not.toBe(original);
        expect(await getAlgorithmById(copied)).not.toBeNull();
    });
});
