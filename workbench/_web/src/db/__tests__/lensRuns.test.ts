/**
 * Integration tests for F1 prompt-history persistence (lens_runs) on SQLite.
 *
 * Verifies create/list/clear, model scoping (strips only align within one
 * model), chronological ordering, and JSON round-trip of the compact
 * LensRunData slice.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { clearDatabase } from "../client";
import {
    createLensRun,
    getLensRunsByChart,
    clearLensRunsForChart,
    deleteLensRun,
} from "@/lib/queries/lensRunQueries";
import type { LensRunData } from "@/types/lensRun";

const WS = "ws-test-1";
const CHART_A = "chart-aaaa";
const CHART_B = "chart-bbbb";

const sampleData = (slot: "source" | "target", finalToken: string): LensRunData => ({
    slot,
    finalToken,
    lastRow: {
        layers: [0, 1, 2],
        cells: [
            { token: " the", prob: 0.12 },
            { token: " Paris", prob: 0.44 },
            { token: finalToken, prob: 0.91 },
        ],
    },
    params: { topk: 10, includeEntropy: true },
});

describe("lens_runs (F1 prompt history)", () => {
    beforeEach(async () => {
        await clearDatabase();
    });

    it("creates a run and reads it back with the JSON payload intact", async () => {
        const created = await createLensRun({
            workspaceId: WS,
            chartId: CHART_A,
            model: "meta-llama/Llama-3.1-8B",
            prompt: "The Eiffel Tower is in",
            data: sampleData("source", " Paris"),
        });

        expect(created.id).toBeTruthy();
        expect(created.prompt).toBe("The Eiffel Tower is in");

        const rows = await getLensRunsByChart(CHART_A);
        expect(rows).toHaveLength(1);
        expect(rows[0].data.slot).toBe("source");
        expect(rows[0].data.finalToken).toBe(" Paris");
        expect(rows[0].data.lastRow.cells).toHaveLength(3);
        expect(rows[0].data.lastRow.cells[2].prob).toBeCloseTo(0.91);
        expect(rows[0].data.params.topk).toBe(10);
    });

    it("returns runs oldest → newest for a chart", async () => {
        for (const tok of [" A", " B", " C"]) {
            await createLensRun({
                workspaceId: WS,
                chartId: CHART_A,
                model: "m1",
                prompt: `prompt${tok}`,
                data: sampleData("source", tok),
            });
            // distinct timestamps without relying on Date.now resolution
            await new Promise((r) => setTimeout(r, 5));
        }
        const rows = await getLensRunsByChart(CHART_A);
        expect(rows.map((r) => r.data.finalToken)).toEqual([" A", " B", " C"]);
    });

    it("scopes history by chart and (optionally) model", async () => {
        await createLensRun({ workspaceId: WS, chartId: CHART_A, model: "m1", prompt: "a", data: sampleData("source", " x") });
        await createLensRun({ workspaceId: WS, chartId: CHART_A, model: "m2", prompt: "b", data: sampleData("source", " y") });
        await createLensRun({ workspaceId: WS, chartId: CHART_B, model: "m1", prompt: "c", data: sampleData("source", " z") });

        expect(await getLensRunsByChart(CHART_A)).toHaveLength(2);
        expect(await getLensRunsByChart(CHART_A, "m1")).toHaveLength(1);
        expect(await getLensRunsByChart(CHART_B)).toHaveLength(1);
    });

    it("clears a chart's history without touching another chart", async () => {
        await createLensRun({ workspaceId: WS, chartId: CHART_A, model: "m1", prompt: "a", data: sampleData("source", " x") });
        await createLensRun({ workspaceId: WS, chartId: CHART_B, model: "m1", prompt: "b", data: sampleData("source", " y") });

        await clearLensRunsForChart(CHART_A);
        expect(await getLensRunsByChart(CHART_A)).toHaveLength(0);
        expect(await getLensRunsByChart(CHART_B)).toHaveLength(1);
    });

    it("deletes a single run by id", async () => {
        const a = await createLensRun({ workspaceId: WS, chartId: CHART_A, model: "m1", prompt: "a", data: sampleData("source", " x") });
        await createLensRun({ workspaceId: WS, chartId: CHART_A, model: "m1", prompt: "b", data: sampleData("source", " y") });

        await deleteLensRun(a.id);
        const rows = await getLensRunsByChart(CHART_A);
        expect(rows).toHaveLength(1);
        expect(rows[0].prompt).toBe("b");
    });
});
