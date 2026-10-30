/**
 * Integration tests for the owner checks on chart, report and lens-run
 * writes, on SQLite.
 *
 * The "use server" wrappers in chartQueries.ts, documentQueries.ts and
 * lensRunQueries.ts pass the signed-in user to the internals in chartDb.ts,
 * documentDb.ts and lensRunDb.ts; these tests call the internals with one
 * user against another user's rows (and a workshop participant against their
 * own workshop workspace, which must keep working).
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import type { SerializedEditorState } from "lexical";
import { db, clearDatabase } from "../client";
import { charts, documents, lensRuns } from "../schema";
import {
    assertChartWorkspace,
    copyChart,
    createLogitLensChartPair,
    createPatchLensChartPair,
    deleteChart,
    renameChart,
    setChartData,
} from "@/lib/queries/chartDb";
import { createDocument, deleteDocument, updateDocument } from "@/lib/queries/documentDb";
import {
    clearLensRunsForChart,
    createLensRun,
    deleteLensRun,
    getLensRunHeatmaps,
    getLensRunHeatmapsByIds,
    getLensRunsByChart,
    updateLensRunIntervention,
} from "@/lib/queries/lensRunDb";
import { createWorkshop } from "@/lib/queries/workshopDb";
import { createWorkspace } from "@/lib/queries/workspaceDb";
import type { ChartData } from "@/types/charts";
import type { LensRunHeatmaps, LensRunPromptSummary, LensRunSummary } from "@/types/lensRun";
import type { LogitLensIntroData } from "@/types/logitLensIntro";

const OWNER = "owner";
const INTRUDER = "intruder";

const lensConfig = {
    prompt: "The Eiffel Tower is in",
    model: "gpt2",
    topk: 5,
    includeEntropy: true,
};

const content = (text: string) =>
    ({
        root: {
            type: "root",
            children: [{ type: "paragraph", children: [{ type: "text", text }] }],
        },
    }) as unknown as SerializedEditorState;

const chartRow = async (chartId: string) =>
    (await db.select().from(charts).where(eq(charts.id, chartId)))[0];

const documentRow = async (documentId: string) =>
    (await db.select().from(documents).where(eq(documents.id, documentId)))[0];

const chartRuns = async (chartId: string) =>
    db.select().from(lensRuns).where(eq(lensRuns.chartId, chartId));

const runInput = (chartId: string) => ({
    chartId,
    model: "gpt2",
    summary: { params: {} } as LensRunSummary,
    heatmaps: {} as LensRunHeatmaps,
});

/** Attaches a patch to run `runId` as `userId`. */
const patchRun = (userId: string, runId: string) =>
    updateLensRunIntervention(
        userId,
        runId,
        { srcTokenPos: 1, srcLayer: 12, tgtTokenPos: 1, tgtLayer: 12 },
        { prompt: "The Colosseum is in", finalToken: " Paris" } as LensRunPromptSummary,
        {} as LogitLensIntroData,
    );

const workshopInput = (allowedTools: ("logit-lens" | "patch-lens")[]) => ({
    name: "Pilot",
    allowedTools,
    model: "gpt2",
    starterPrompt: "",
    allowModelChange: false,
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    createdBy: "admin@example.edu",
});

describe("chart writes", () => {
    let workspaceId: string;
    let chartId: string;

    beforeEach(async () => {
        await clearDatabase();
        workspaceId = (await createWorkspace(OWNER, "Mine")).id;
        chartId = (await createLogitLensChartPair(workspaceId, lensConfig)).chart.id;
        await renameChart(OWNER, chartId, "Original");
    });

    it("refuse another user's rename, copy, data and delete", async () => {
        await createWorkspace(INTRUDER, "Theirs");

        await expect(renameChart(INTRUDER, chartId, "Hacked")).rejects.toThrow("access denied");
        await expect(copyChart(INTRUDER, chartId)).rejects.toThrow("access denied");
        await expect(
            setChartData(
                INTRUDER,
                chartId,
                { tampered: true } as unknown as ChartData,
                "logit-lens",
            ),
        ).rejects.toThrow("access denied");
        await expect(deleteChart(INTRUDER, chartId)).rejects.toThrow("access denied");

        const chart = await chartRow(chartId);
        expect(chart.name).toBe("Original");
        expect(chart.data).toBeNull();
        const inWorkspace = await db
            .select()
            .from(charts)
            .where(eq(charts.workspaceId, workspaceId));
        expect(inWorkspace.length).toBe(1);
    });

    it("let the owner rename, copy, save and delete", async () => {
        await renameChart(OWNER, chartId, "Renamed");
        await setChartData(OWNER, chartId, { ok: true } as unknown as ChartData, "logit-lens");
        const copy = await copyChart(OWNER, chartId);
        await deleteChart(OWNER, chartId);

        expect(await chartRow(chartId)).toBeUndefined();
        const copied = await chartRow(copy.id);
        expect(copied.workspaceId).toBe(workspaceId);
        expect(copied.data).toEqual({ ok: true });
    });

    it("throw for a chart that doesn't exist", async () => {
        await expect(deleteChart(OWNER, "missing")).rejects.toThrow("Chart not found");
    });

    it("only add charts to the user's own workspaces", async () => {
        const theirs = await createWorkspace(INTRUDER, "Theirs");
        expect(await assertChartWorkspace(OWNER, workspaceId)).toBe(workspaceId);
        await expect(assertChartWorkspace(OWNER, theirs.id)).rejects.toThrow("access denied");
        await expect(assertChartWorkspace(OWNER, "missing")).rejects.toThrow("access denied");
    });

    it("keep working for a participant in their own workshop workspace", async () => {
        const workshop = await createWorkshop(workshopInput(["logit-lens"]));
        const participant = "anon-participant";
        const ws = await createWorkspace(participant, "Pilot", workshop.id);
        const own = (await createLogitLensChartPair(ws.id, lensConfig)).chart.id;

        await renameChart(participant, own, "My guided chart");
        const copy = await copyChart(participant, own);
        await deleteChart(participant, copy.id);

        expect((await chartRow(own)).name).toBe("My guided chart");
        expect(await chartRow(copy.id)).toBeUndefined();
        await expect(renameChart(INTRUDER, own, "Hacked")).rejects.toThrow("access denied");
    });
});

describe("report writes", () => {
    let workspaceId: string;

    beforeEach(async () => {
        await clearDatabase();
        workspaceId = (await createWorkspace(OWNER, "Mine")).id;
    });

    it("refuse another user's create, update and delete", async () => {
        const report = await createDocument(OWNER, workspaceId);
        await createWorkspace(INTRUDER, "Theirs");

        await expect(createDocument(INTRUDER, workspaceId)).rejects.toThrow("access denied");
        await expect(updateDocument(INTRUDER, report.id, content("Hacked"))).rejects.toThrow(
            "access denied",
        );
        await expect(deleteDocument(INTRUDER, report.id)).rejects.toThrow("access denied");

        expect((await documentRow(report.id)).content).toEqual(report.content);
        const inWorkspace = await db
            .select()
            .from(documents)
            .where(eq(documents.workspaceId, workspaceId));
        expect(inWorkspace.length).toBe(1);
    });

    it("let the owner update and delete", async () => {
        const report = await createDocument(OWNER, workspaceId);

        const updated = await updateDocument(OWNER, report.id, content("Findings"));
        expect(updated.content).toEqual(content("Findings"));

        await deleteDocument(OWNER, report.id);
        expect(await documentRow(report.id)).toBeUndefined();
    });
});

describe("lens run writes", () => {
    let chartId: string;
    let runId: string;

    beforeEach(async () => {
        await clearDatabase();
        const workspaceId = (await createWorkspace(OWNER, "Mine")).id;
        chartId = (await createPatchLensChartPair(workspaceId)).chart.id;
        runId = (await createLensRun(OWNER, runInput(chartId))).id;
        await createWorkspace(INTRUDER, "Theirs");
    });

    it("refuse another user's create, patch, delete and clear", async () => {
        await expect(createLensRun(INTRUDER, runInput(chartId))).rejects.toThrow("access denied");
        await expect(patchRun(INTRUDER, runId)).rejects.toThrow("access denied");
        await expect(deleteLensRun(INTRUDER, runId)).rejects.toThrow("access denied");
        await expect(clearLensRunsForChart(INTRUDER, chartId)).rejects.toThrow("access denied");

        const runs = await chartRuns(chartId);
        expect(runs.length).toBe(1);
        expect(runs[0].summary.intervention).toBeUndefined();
    });

    it("hide another user's runs from the history and heatmap reads", async () => {
        expect(await getLensRunsByChart(INTRUDER, chartId)).toEqual([]);
        expect(await getLensRunHeatmapsByIds(INTRUDER, [runId])).toEqual([]);
        expect(await getLensRunHeatmaps(INTRUDER, runId)).toBeNull();

        expect(await getLensRunsByChart(OWNER, chartId)).toHaveLength(1);
        expect(await getLensRunHeatmaps(OWNER, runId)).not.toBeNull();
    });

    it("let the owner patch, delete and clear", async () => {
        await patchRun(OWNER, runId);
        expect((await chartRuns(chartId))[0].summary.intervention?.srcLayer).toBe(12);

        await deleteLensRun(OWNER, runId);
        expect(await chartRuns(chartId)).toEqual([]);

        await createLensRun(OWNER, runInput(chartId));
        await clearLensRunsForChart(OWNER, chartId);
        expect(await chartRuns(chartId)).toEqual([]);
    });

    it("throw for a run or chart that doesn't exist", async () => {
        await expect(deleteLensRun(OWNER, "missing")).rejects.toThrow("Lens run not found");
        await expect(patchRun(OWNER, "missing")).rejects.toThrow("Lens run not found");
        await expect(createLensRun(OWNER, runInput("missing"))).rejects.toThrow("Chart not found");
    });

    it("keep working for a participant in their own workshop workspace", async () => {
        const workshop = await createWorkshop(workshopInput(["patch-lens"]));
        const participant = "anon-participant";
        const ws = await createWorkspace(participant, "Pilot", workshop.id);
        const own = (await createPatchLensChartPair(ws.id)).chart.id;

        const run = await createLensRun(participant, runInput(own));
        await patchRun(participant, run.id);

        expect(run.workspaceId).toBe(ws.id);
        const [listed] = await getLensRunsByChart(participant, own);
        expect(listed.summary.intervention?.tgtLayer).toBe(12);
        expect(await getLensRunHeatmaps(participant, run.id)).not.toBeNull();
        await expect(patchRun(INTRUDER, run.id)).rejects.toThrow("access denied");
    });
});
