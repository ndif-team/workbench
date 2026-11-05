/**
 * Integration tests for Algorithm Hypothesis persistence on SQLite: the
 * algorithms table, chart creation (a chart points at a new blank algorithm),
 * and chart copies getting their own algorithm.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { clearDatabase, db } from "../client";
import { workspaces } from "../schema";
import {
    copyAlgorithm,
    getUserAlgorithm,
    insertAlgorithm,
    listAlgorithms,
    listSavedAlgorithms,
    saveVersion,
    writeDefinition,
} from "@/lib/queries/algorithmDb";
import { copyChart, createAlgorithmHypothesisChartPair } from "@/lib/queries/chartDb";
import { getConfigForChart } from "@/lib/queries/chartQueries";
import { blankAlgorithm } from "@/lib/algorithmHypothesis/grids";
import type {
    AlgorithmDefinition,
    AlgorithmHypothesisChartData,
} from "@/types/algorithmHypothesis";

const USER = "user-algorithms";
let WS = "";

describe("algorithms", () => {
    beforeEach(async () => {
        await clearDatabase();
        const [row] = await db
            .insert(workspaces)
            .values({ userId: USER, name: "Work" })
            .returning();
        WS = row.id;
    });

    it("saves a complete version that later edits don't change", async () => {
        const draft = await insertAlgorithm(WS, blankAlgorithm("Positional"));
        await insertAlgorithm(WS, blankAlgorithm("Still a draft"));
        expect(await listSavedAlgorithms(WS)).toEqual([]);

        const v1: AlgorithmDefinition = {
            ...blankAlgorithm("Positional"),
            template: "Ann loves ale.",
        };
        const saved = await saveVersion(USER, draft.id, v1);
        expect(saved?.savedDefinition).toEqual(v1);
        expect(saved?.savedAt).toBeInstanceOf(Date);

        // Autosaving the working copy leaves the saved version alone.
        await writeDefinition(USER, draft.id, { ...v1, template: "Joe loves jam." });
        const list = await listSavedAlgorithms(WS);
        expect(list.map((r) => r.id)).toEqual([draft.id]);
        expect(list[0].definition.template).toBe("Ann loves ale.");
        const items = await listAlgorithms(WS);
        expect(items.find((r) => r.id === draft.id)?.savedAt).toBeInstanceOf(Date);
        expect(items.find((r) => r.id !== draft.id)?.savedAt).toBeNull();
    });

    it("creates, reads, updates and lists", async () => {
        const row = await insertAlgorithm(WS, blankAlgorithm("Positional"));
        expect(row.name).toBe("Positional");
        expect((await getUserAlgorithm(USER, row.id))?.definition).toEqual(
            blankAlgorithm("Positional"),
        );

        const next: AlgorithmDefinition = {
            ...blankAlgorithm("Renamed"),
            template: "Ann loves ale.",
        };
        await writeDefinition(USER, row.id, next);
        const read = await getUserAlgorithm(USER, row.id);
        expect(read?.name).toBe("Renamed");
        expect((read?.definition as AlgorithmDefinition).template).toBe("Ann loves ale.");

        await insertAlgorithm("other-workspace", blankAlgorithm("Elsewhere"));
        const list = await listAlgorithms(WS);
        expect(list.map((a) => a.name)).toEqual(["Renamed"]);
    });

    it("duplicates into the same workspace", async () => {
        const row = await insertAlgorithm(WS, blankAlgorithm("Lexical"));
        const copy = await copyAlgorithm(row.id);
        expect(copy?.id).not.toBe(row.id);
        expect(copy?.workspaceId).toBe(WS);
        expect(copy?.name).toBe("Copy of Lexical");
    });

    it("a new chart points at a new blank algorithm", async () => {
        const { chart } = await createAlgorithmHypothesisChartPair(WS);
        expect((await getConfigForChart(chart.id))?.type).toBe("algorithm-hypothesis");
        const data = chart.data as AlgorithmHypothesisChartData;
        const algorithm = await getUserAlgorithm(USER, data.algorithmId);
        expect(algorithm?.workspaceId).toBe(WS);
        expect((algorithm?.definition as AlgorithmDefinition).variables).toEqual([]);
    });

    it("a copied chart gets its own algorithm", async () => {
        const { chart } = await createAlgorithmHypothesisChartPair(WS);
        const copy = await copyChart(USER, chart.id);
        const original = (chart.data as AlgorithmHypothesisChartData).algorithmId;
        const copied = (copy.data as AlgorithmHypothesisChartData).algorithmId;
        expect(copied).not.toBe(original);
        expect(await getUserAlgorithm(USER, copied)).not.toBeNull();
    });

    it("another user can neither read nor change an algorithm", async () => {
        const row = await insertAlgorithm(WS, blankAlgorithm("Mine"));
        expect(await getUserAlgorithm("someone-else", row.id)).toBeNull();
        const taken = { ...blankAlgorithm("Taken") };
        expect(await writeDefinition("someone-else", row.id, taken)).toBeNull();
        expect(await saveVersion("someone-else", row.id, taken)).toBeNull();
        expect((await getUserAlgorithm(USER, row.id))?.name).toBe("Mine");
    });
});
