/**
 * Integration tests for F1 prompt-history persistence (lens_runs) on SQLite.
 *
 * Verifies create/list/clear/update, model scoping (strips only align within
 * one model), chronological ordering (createdAt asc, id tiebreaker), the
 * summary/heatmaps split (list queries never return `data`; heatmaps are fetched
 * on demand by id), the patch-attach update, and the per-chart retention cap.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { clearDatabase } from "../client";
import {
    createLensRun,
    getLensRunsByChart,
    getLensRunHeatmaps,
    getLensRunHeatmapsByIds,
    clearLensRunsForChart,
    deleteLensRun,
    updateLensRunIntervention,
} from "@/lib/queries/lensRunQueries";
import { createWorkspace } from "@/lib/queries/workspaceQueries";
import { createLensChartPair } from "@/lib/queries/chartQueries";
import { setDevUserId } from "@/lib/auth/devUser";
import { Metrics } from "@/types/lens";
import type { LensConfigData } from "@/types/lens";
import type { LensRunSummary, LensRunHeatmaps, LensRunPromptSummary } from "@/types/lensRun";
import type { LogitLensIntroData } from "@/types/logitLensIntro";

const USER = "lens-run-user";

// lens_runs are owner-scoped via their workspace, and createLensRun verifies the
// caller owns the parent chart — so these tests build a real workspace + two
// charts and use their ids rather than synthetic strings.
let WS: string;
let CHART_A: string;
let CHART_B: string;

const lensConfig = (prompt: string): LensConfigData => ({
    prompt,
    model: "gpt2",
    statisticType: Metrics.PROBABILITY,
    token: { idx: 0, id: 0, text: "", targetIds: [] },
});

// A minimal but well-formed full lens payload (1 layer, 1 token).
const fakeLens = (finalToken: string): LogitLensIntroData =>
    ({
        meta: { version: 1, timestamp: "t", model: "m1" },
        layers: [0],
        input: ["BOS", " in"],
        tracked: [{}, { [finalToken]: [0.9] }],
        topk: [[[finalToken], [finalToken]]],
    }) as unknown as LogitLensIntroData;

const promptSummary = (prompt: string, finalToken: string): LensRunPromptSummary => ({
    prompt,
    finalToken,
    lastRow: {
        layers: [0, 1, 2],
        cells: [
            { token: " the", prob: 0.12 },
            { token: " Paris", prob: 0.44 },
            { token: finalToken, prob: 0.91 },
        ],
    },
});

// The compact slice persisted to lens_runs.summary.
const summary = (srcTok: string, tgtTok?: string): LensRunSummary => ({
    source: promptSummary("The Eiffel Tower is in", srcTok),
    ...(tgtTok ? { target: promptSummary("The Colosseum is in", tgtTok) } : {}),
    params: { topk: 10, includeEntropy: true },
});

// The full per-prompt heatmaps persisted to lens_runs.data.
const heatmaps = (srcTok = " Paris", tgtTok?: string): LensRunHeatmaps => ({
    source: fakeLens(srcTok),
    ...(tgtTok ? { target: fakeLens(tgtTok) } : {}),
});

describe("lens_runs (F1 prompt history)", () => {
    beforeEach(async () => {
        await clearDatabase();
        setDevUserId(USER);
        const ws = await createWorkspace("Lens Run Workspace");
        WS = ws.id;
        const [{ chart: a }, { chart: b }] = [
            await createLensChartPair(WS, lensConfig("chart a")),
            await createLensChartPair(WS, lensConfig("chart b")),
        ];
        CHART_A = a.id;
        CHART_B = b.id;
    });

    it("creates a run and reads back the compact summary payload intact", async () => {
        const created = await createLensRun({
            chartId: CHART_A,
            model: "meta-llama/Llama-3.1-8B",
            summary: summary(" Paris", " Rome"),
            heatmaps: heatmaps(" Paris", " Rome"),
        });

        expect(created.id).toBeTruthy();

        const rows = await getLensRunsByChart(WS, CHART_A);
        expect(rows).toHaveLength(1);
        expect(rows[0].summary.source.finalToken).toBe(" Paris");
        expect(rows[0].summary.target?.finalToken).toBe(" Rome");
        expect(rows[0].summary.params.topk).toBe(10);
    });

    it("never returns the heavy `data` heatmaps from list queries", async () => {
        await createLensRun({
            chartId: CHART_A,
            model: "m1",
            summary: summary(" Paris"),
            heatmaps: heatmaps(" Paris"),
        });
        const rows = await getLensRunsByChart(WS, CHART_A);
        expect("data" in rows[0]).toBe(false);
    });

    it("fetches full heatmaps on demand by id", async () => {
        const created = await createLensRun({
            chartId: CHART_A,
            model: "m1",
            summary: summary(" Paris", " Rome"),
            heatmaps: heatmaps(" Paris", " Rome"),
        });

        const single = await getLensRunHeatmaps(created.id);
        expect(single).not.toBeNull();
        expect(single!.data.source).toBeTruthy();
        expect(single!.data.target).toBeTruthy();

        const batch = await getLensRunHeatmapsByIds([created.id]);
        expect(batch).toHaveLength(1);
        expect(batch[0].data.source).toBeTruthy();
    });

    it("returns [] / null for empty or unknown heatmap fetches", async () => {
        expect(await getLensRunHeatmapsByIds([])).toEqual([]);
        expect(await getLensRunHeatmaps("does-not-exist")).toBeNull();
    });

    it("attaches a patch to an existing run via updateLensRunIntervention", async () => {
        const created = await createLensRun({
            chartId: CHART_A,
            model: "m1",
            summary: summary(" Paris", " Rome"),
            heatmaps: heatmaps(" Paris", " Rome"),
        });

        await updateLensRunIntervention(
            created.id,
            { srcTokenPos: 1, srcLayer: 12, tgtTokenPos: 1, tgtLayer: 12 },
            promptSummary("The Colosseum is in", " Paris"),
            fakeLens(" Paris"),
        );

        const [row] = await getLensRunsByChart(WS, CHART_A);
        // Source/target preserved on the summary, patch merged on.
        expect(row.summary.source.finalToken).toBe(" Paris");
        expect(row.summary.intervention?.srcLayer).toBe(12);
        expect(row.summary.interventionResult?.finalToken).toBe(" Paris");

        // The patched heatmap is merged onto `data` too.
        const full = await getLensRunHeatmaps(created.id);
        expect(full!.data.interventionResult).toBeTruthy();
    });

    it("returns runs oldest → newest for a chart (createdAt asc, id asc)", async () => {
        for (const tok of [" A", " B", " C"]) {
            await createLensRun({
                chartId: CHART_A,
                model: "m1",
                summary: summary(tok),
                heatmaps: heatmaps(tok),
            });
            await new Promise((r) => setTimeout(r, 5));
        }
        const rows = await getLensRunsByChart(WS, CHART_A);
        expect(rows.map((r) => r.summary.source.finalToken)).toEqual([" A", " B", " C"]);
    });

    it("scopes history by chart and (optionally) model", async () => {
        await createLensRun({
            chartId: CHART_A,
            model: "m1",
            summary: summary(" x"),
            heatmaps: heatmaps(" x"),
        });
        await createLensRun({
            chartId: CHART_A,
            model: "m2",
            summary: summary(" y"),
            heatmaps: heatmaps(" y"),
        });
        await createLensRun({
            chartId: CHART_B,
            model: "m1",
            summary: summary(" z"),
            heatmaps: heatmaps(" z"),
        });

        expect(await getLensRunsByChart(WS, CHART_A)).toHaveLength(2);
        expect(await getLensRunsByChart(WS, CHART_A, "m1")).toHaveLength(1);
        expect(await getLensRunsByChart(WS, CHART_B)).toHaveLength(1);
        // Workspace scoping: the same chart id under a different workspace reads nothing.
        expect(await getLensRunsByChart("other-ws", CHART_A)).toHaveLength(0);
    });

    it("clears a chart's history without touching another chart", async () => {
        await createLensRun({
            chartId: CHART_A,
            model: "m1",
            summary: summary(" x"),
            heatmaps: heatmaps(" x"),
        });
        await createLensRun({
            chartId: CHART_B,
            model: "m1",
            summary: summary(" y"),
            heatmaps: heatmaps(" y"),
        });

        await clearLensRunsForChart(WS, CHART_A);
        expect(await getLensRunsByChart(WS, CHART_A)).toHaveLength(0);
        expect(await getLensRunsByChart(WS, CHART_B)).toHaveLength(1);
    });

    it("deletes a single run by id", async () => {
        const a = await createLensRun({
            chartId: CHART_A,
            model: "m1",
            summary: summary(" x"),
            heatmaps: heatmaps(" x"),
        });
        await new Promise((r) => setTimeout(r, 5));
        await createLensRun({
            chartId: CHART_A,
            model: "m1",
            summary: summary(" y"),
            heatmaps: heatmaps(" y"),
        });

        await deleteLensRun(a.workspaceId, a.id);
        const rows = await getLensRunsByChart(WS, CHART_A);
        expect(rows).toHaveLength(1);
        expect(rows[0].summary.source.finalToken).toBe(" y");
    });

    it("caps history per chart at RETENTION_CAP, dropping the oldest", async () => {
        const RETENTION_CAP = 50;
        const total = RETENTION_CAP + 3;
        for (let i = 0; i < total; i++) {
            await createLensRun({
                chartId: CHART_A,
                model: "m1",
                summary: summary(` t${i}`),
                heatmaps: heatmaps(),
            });
            // Vary createdAt so the prune's chronological ordering is deterministic.
            await new Promise((r) => setTimeout(r, 2));
        }

        const rows = await getLensRunsByChart(WS, CHART_A);
        expect(rows).toHaveLength(RETENTION_CAP);

        // The 3 oldest tokens should have been pruned; the newest survive.
        const tokens = rows.map((r) => r.summary.source.finalToken);
        expect(tokens).not.toContain(" t0");
        expect(tokens).not.toContain(" t1");
        expect(tokens).not.toContain(" t2");
        expect(tokens).toContain(` t${total - 1}`);
    });
});
