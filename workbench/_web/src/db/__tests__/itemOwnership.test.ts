/**
 * Integration tests for the owner checks on chart and report writes, on
 * SQLite.
 *
 * The "use server" wrappers in chartQueries.ts and documentQueries.ts pass
 * the signed-in user to the internals in chartDb.ts and documentDb.ts; these
 * tests call the internals with one user against another user's rows (and a
 * workshop participant against their own workshop workspace, which must keep
 * working).
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import type { SerializedEditorState } from "lexical";
import { db, clearDatabase } from "../client";
import { charts, documents } from "../schema";
import {
    assertChartWorkspace,
    copyChart,
    createLogitLensChartPair,
    deleteChart,
    renameChart,
    setChartData,
} from "@/lib/queries/chartDb";
import { createDocument, deleteDocument, updateDocument } from "@/lib/queries/documentDb";
import { createWorkshop } from "@/lib/queries/workshopDb";
import { createWorkspace } from "@/lib/queries/workspaceDb";
import type { ChartData } from "@/types/charts";

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
        const workshop = await createWorkshop({
            name: "Pilot",
            allowedTools: ["logit-lens"],
            model: "gpt2",
            starterPrompt: "",
            allowModelChange: false,
            expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
            createdBy: "admin@example.edu",
        });
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
