/**
 * Integration tests for the default workspace, the sidebar library and moves
 * on SQLite.
 *
 * Exercises the internals in lib/queries/workspaceDb.ts (the "use server"
 * wrappers in workspaceQueries.ts only resolve the signed-in user before
 * calling these). Covers idempotent default creation, adoption of the
 * old flow's "Default Workspace", the one-default-per-user index, library
 * grouping, ordering and chart prompts, chart and report moves (config and lens runs follow
 * the chart), refused moves, and the default workspace staying out of folder
 * lists and out of reach of rename/delete.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { and, eq } from "drizzle-orm";
import type { SerializedEditorState } from "lexical";
import { db, clearDatabase } from "../client";
import { charts, configs, documents, isUuid, lensRuns, workspaces } from "../schema";
import {
    DEFAULT_WORKSPACE_NAME,
    MAX_WORKSPACE_NAME_LENGTH,
    createWorkspace,
    deleteWorkspace,
    getChartWorkspaceScope,
    getMostRecentUserChart,
    getOrCreateDefaultWorkspace,
    getReportWorkspaceScope,
    getWorkspaceById,
    getWorkspaceLibrary,
    getWorkspaces,
    moveChart,
    moveReport,
    renameWorkspace,
    reorderWorkspaceItems,
} from "@/lib/queries/workspaceDb";
import { getConfigForChart } from "@/lib/queries/chartQueries";
import { createLogitLensChartPair, createPatchLensChartPair } from "@/lib/queries/chartDb";
import { createDocument, updateDocument } from "@/lib/queries/documentDb";
import { setConfig } from "@/lib/queries/configQueries";
import { createLensRun } from "@/lib/queries/lensRunQueries";
import { createWorkshop } from "@/lib/queries/workshopDb";
import type { LensRunHeatmaps, LensRunSummary } from "@/types/lensRun";
import type { LibraryItem } from "@/types/workspaces";

const USER = "user-a";
const OTHER = "user-b";

const lensConfig = (prompt = "The Eiffel Tower is in") => ({
    prompt,
    model: "gpt2",
    topk: 5,
    includeEntropy: true,
});

const createChart = async (workspaceId: string, name: string) => {
    const { chart } = await createLogitLensChartPair(workspaceId, lensConfig());
    await db.update(charts).set({ name }).where(eq(charts.id, chart.id));
    return chart.id as string;
};

/** Stamps an explicit updatedAt (sqlite timestamps are second precision, so
 * rows created in one test would otherwise tie). */
const setChartUpdatedAt = (chartId: string, secondsAgo: number) =>
    db
        .update(charts)
        .set({ updatedAt: new Date(Date.now() - secondsAgo * 1000) })
        .where(eq(charts.id, chartId));

const reportWithTitle = (title: string) =>
    ({
        root: {
            type: "root",
            children: [{ type: "heading", children: [{ type: "text", text: `# ${title}` }] }],
        },
    }) as unknown as SerializedEditorState;

const insertLensRun = (workspaceId: string, chartId: string) =>
    db.insert(lensRuns).values({
        workspaceId,
        chartId,
        model: "gpt2",
        summary: {} as LensRunSummary,
        data: {} as LensRunHeatmaps,
    });

const workshopInput = () => ({
    name: "Pilot",
    allowedTools: ["logit-lens" as const],
    model: "gpt2",
    starterPrompt: "",
    allowModelChange: false,
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    createdBy: "admin@example.edu",
});

const ids = (items: LibraryItem[]) => items.map((i) => i.id);

/**
 * Stands in for the next `db.update(…)` chain: awaiting it runs `meanwhile`
 * (a racing request's write) and then settles with `outcome`, to reach the
 * branches only a real race would.
 */
const interceptNextUpdate = (
    meanwhile: () => Promise<unknown>,
    outcome: { rows: unknown[] } | { error: Error },
) => {
    const realUpdate = db.update;
    const chain: object = new Proxy(
        {},
        {
            get: (_, prop) =>
                prop === "then"
                    ? (resolve: (rows: unknown[]) => void, reject: (err: unknown) => void) =>
                          meanwhile().then(
                              () =>
                                  "error" in outcome
                                      ? reject(outcome.error)
                                      : resolve(outcome.rows),
                              reject,
                          )
                    : () => chain,
        },
    );
    db.update = () => {
        db.update = realUpdate;
        return chain;
    };
    return () => {
        db.update = realUpdate;
    };
};

describe("default workspace", () => {
    beforeEach(async () => {
        await clearDatabase();
    });

    it("creates one default workspace per user, idempotently", async () => {
        const first = await getOrCreateDefaultWorkspace(USER);
        const again = await getOrCreateDefaultWorkspace(USER);
        const concurrent = await Promise.all([
            getOrCreateDefaultWorkspace(USER),
            getOrCreateDefaultWorkspace(USER),
        ]);

        expect(first.isDefault).toBe(true);
        expect(first.name).toBe(DEFAULT_WORKSPACE_NAME);
        expect(again.id).toBe(first.id);
        expect(concurrent.map((w) => w.id)).toEqual([first.id, first.id]);

        const rows = await db
            .select()
            .from(workspaces)
            .where(and(eq(workspaces.userId, USER), eq(workspaces.isDefault, true)));
        expect(rows.length).toBe(1);

        const other = await getOrCreateDefaultWorkspace(OTHER);
        expect(other.id).not.toBe(first.id);
    });

    it("rejects a second default for the same user at the index", async () => {
        await getOrCreateDefaultWorkspace(USER);
        const insertSecond = async () => {
            await db.insert(workspaces).values({ userId: USER, name: "Another", isDefault: true });
        };
        await expect(insertSecond()).rejects.toThrow(/unique/i);
    });

    it("adopts the oldest non-workshop 'Default Workspace' from the old first-visit flow", async () => {
        const workshop = await createWorkshop(workshopInput());
        const workshopDefault = await createWorkspace(USER, "Default Workspace", workshop.id);
        const legacy = await createWorkspace(USER, "Default Workspace");
        const newer = await createWorkspace(USER, "Default Workspace");
        const ageBy = (workspaceId: string, seconds: number) =>
            db
                .update(workspaces)
                .set({ createdAt: new Date(Date.now() - seconds * 1000) })
                .where(eq(workspaces.id, workspaceId));
        await ageBy(workshopDefault.id, 120);
        await ageBy(legacy.id, 60);
        const chartId = await createChart(legacy.id, "Old chart");

        const adopted = await getOrCreateDefaultWorkspace(USER);

        expect(adopted.id).toBe(legacy.id);
        expect(adopted.isDefault).toBe(true);
        expect((await getWorkspaceById(newer.id))!.isDefault).toBe(false);
        expect((await getWorkspaceById(workshopDefault.id))!.isDefault).toBe(false);

        const library = await getWorkspaceLibrary(USER);
        expect(library.defaultWorkspaceId).toBe(legacy.id);
        expect(ids(library.defaultItems)).toEqual([chartId]);
    });

    it("adopts the same legacy workspace whatever order equal timestamps come back in", async () => {
        const created = new Date(Date.now() - 60_000);
        const first = await createWorkspace(USER, "Default Workspace");
        const second = await createWorkspace(USER, "Default Workspace");
        await db.update(workspaces).set({ createdAt: created }).where(eq(workspaces.userId, USER));
        const lowerId = [first.id, second.id].sort()[0];

        expect((await getOrCreateDefaultWorkspace(USER)).id).toBe(lowerId);
        const others = await getWorkspaces(USER);
        expect(others.map((w: { id: string; name: string }) => [w.id, w.name])).toEqual([
            [[first.id, second.id].find((id) => id !== lowerId), "Default Workspace"],
        ]);
    });

    it("inserts a default when the legacy workspace vanishes before it is adopted", async () => {
        const legacy = await createWorkspace(USER, "Default Workspace");
        const restore = interceptNextUpdate(
            () => db.delete(workspaces).where(eq(workspaces.id, legacy.id)),
            { rows: [] },
        );
        try {
            const def = await getOrCreateDefaultWorkspace(USER);
            expect(def.id).not.toBe(legacy.id);
            expect(def.name).toBe(DEFAULT_WORKSPACE_NAME);
            expect(def.isDefault).toBe(true);
        } finally {
            restore();
        }
    });

    it("returns the racing request's default when its own write hits the unique index", async () => {
        const legacy = await createWorkspace(USER, "Default Workspace");
        let winnerId = "";
        const restore = interceptNextUpdate(
            async () => {
                winnerId = (await createWorkspace(USER, "Winner")).id;
                await db
                    .update(workspaces)
                    .set({ isDefault: true })
                    .where(eq(workspaces.id, winnerId));
            },
            { error: new Error("UNIQUE constraint failed: workspaces.user_id") },
        );
        try {
            const def = await getOrCreateDefaultWorkspace(USER);
            expect(def.id).toBe(winnerId);
            expect((await getWorkspaceById(legacy.id))!.isDefault).toBe(false);
        } finally {
            restore();
        }
    });

    it("rethrows a write error that isn't a lost race", async () => {
        await createWorkspace(USER, "Default Workspace");
        const restore = interceptNextUpdate(async () => {}, { error: new Error("disk I/O error") });
        try {
            await expect(getOrCreateDefaultWorkspace(USER)).rejects.toThrow("disk I/O error");
        } finally {
            restore();
        }
    });

    it("is left out of folder lists and can't be renamed or deleted", async () => {
        const folder = await createWorkspace(USER, "Folder");
        const def = await getOrCreateDefaultWorkspace(USER);

        const listed = await getWorkspaces(USER);
        expect(listed.map((w: { id: string }) => w.id)).toEqual([folder.id]);

        await expect(renameWorkspace(USER, def.id, "Renamed")).rejects.toThrow(
            "not found or access denied",
        );
        await deleteWorkspace(USER, def.id);
        expect(await getWorkspaceById(def.id)).not.toBeNull();
    });
});

describe("workspace names", () => {
    beforeEach(async () => {
        await clearDatabase();
    });

    it("are trimmed on create and rename", async () => {
        const ws = await createWorkspace(USER, "  IOI circuit ");
        expect(ws.name).toBe("IOI circuit");
        expect((await renameWorkspace(USER, ws.id, "\tInduction heads  ")).name).toBe(
            "Induction heads",
        );
    });

    it("must be 1 to 256 characters", async () => {
        const ws = await createWorkspace(USER, "Folder");
        const longest = "w".repeat(MAX_WORKSPACE_NAME_LENGTH);
        const tooLong = `${longest}w`;

        await expect(createWorkspace(USER, "   ")).rejects.toThrow("between 1 and 256");
        await expect(createWorkspace(USER, tooLong)).rejects.toThrow("between 1 and 256");
        await expect(renameWorkspace(USER, ws.id, "")).rejects.toThrow("between 1 and 256");
        await expect(renameWorkspace(USER, ws.id, tooLong)).rejects.toThrow("between 1 and 256");
        expect((await getWorkspaceById(ws.id))!.name).toBe("Folder");

        expect((await renameWorkspace(USER, ws.id, longest)).name).toBe(longest);
        expect((await getWorkspaces(USER)).map((w: { id: string }) => w.id)).toEqual([ws.id]);
    });
});

describe("workshop workspaces", () => {
    beforeEach(async () => {
        await clearDatabase();
    });

    it("can't be renamed by their participant", async () => {
        const workshop = await createWorkshop(workshopInput());
        const ws = await createWorkspace(USER, "Pilot", workshop.id);

        await expect(renameWorkspace(USER, ws.id, "Mine now")).rejects.toThrow(
            "not found or access denied",
        );
        expect((await getWorkspaceById(ws.id))!.name).toBe("Pilot");
    });

    it("can't be deleted by their participant, so their study data stays", async () => {
        const workshop = await createWorkshop(workshopInput());
        const ws = await createWorkspace(USER, "Pilot", workshop.id);
        const chartId = await createChart(ws.id, "Guided");
        await insertLensRun(ws.id, chartId);

        await deleteWorkspace(USER, ws.id);

        expect(await getWorkspaceById(ws.id)).not.toBeNull();
        expect((await getChartWorkspaceScope(chartId))!.workspaceId).toBe(ws.id);
        const runs = await db.select().from(lensRuns).where(eq(lensRuns.chartId, chartId));
        expect(runs.length).toBe(1);
    });
});

describe("workspace library", () => {
    beforeEach(async () => {
        await clearDatabase();
    });

    it("groups charts and reports by workspace in their display order", async () => {
        const def = await getOrCreateDefaultWorkspace(USER);
        const folderA = await createWorkspace(USER, "Folder A");
        const folderB = await createWorkspace(USER, "Folder B");
        await createWorkspace(OTHER, "Not mine");

        const older = await createChart(def.id, "Older");
        const newer = await createChart(def.id, "Newer");
        const defReport = await createDocument(USER, def.id);
        await setChartUpdatedAt(older, 300);
        await setChartUpdatedAt(newer, 60);
        await db
            .update(documents)
            .set({ updatedAt: new Date(Date.now() - 120_000) })
            .where(eq(documents.id, defReport.id));

        const a1 = await createChart(folderA.id, "A1");
        const aReport = await updateDocument(
            USER,
            (await createDocument(USER, folderA.id)).id,
            reportWithTitle("Findings"),
        );
        const a2 = await createPatchLensChartPair(folderA.id);
        await setChartUpdatedAt(a1, 10);
        await db.update(charts).set({ data: {} }).where(eq(charts.id, a1));

        await db
            .update(workspaces)
            .set({ updatedAt: new Date(Date.now() - 600_000) })
            .where(eq(workspaces.id, folderA.id));

        const library = await getWorkspaceLibrary(USER);

        expect(library.defaultWorkspaceId).toBe(def.id);
        expect(ids(library.defaultItems)).toEqual([newer, defReport.id, older]);

        expect(library.workspaces.map((w) => w.id)).toEqual([folderB.id, folderA.id]);
        const a = library.workspaces[1];
        expect(a.name).toBe("Folder A");
        expect(a.isWorkshop).toBe(false);
        expect(ids(a.items)).toEqual([a1, aReport.id, a2.chart.id]);
        expect(library.workspaces[0].items).toEqual([]);

        const [chartItem, reportItem, patchItem] = a.items;
        expect(chartItem).toMatchObject({
            kind: "chart",
            workspaceId: folderA.id,
            name: "A1",
            toolType: "logit-lens",
            model: "gpt2",
            hasData: true,
        });
        expect(reportItem).toMatchObject({ kind: "report", title: "Findings" });
        expect(patchItem).toMatchObject({
            kind: "chart",
            toolType: "patch-lens",
            model: null,
            hasData: false,
        });

        const fresh = library.defaultItems.find((i) => i.id === newer);
        expect(fresh).toMatchObject({ kind: "chart", hasData: false });
    });

    it("carries each chart's prompt: the config's, or Patch Lens's source prompt", async () => {
        const def = await getOrCreateDefaultWorkspace(USER);
        const lens = await createChart(def.id, "Untitled Chart");
        const { chart: patch } = await createPatchLensChartPair(def.id, {
            sourcePrompt: "The capital of France is",
            targetPrompt: "The capital of Italy is",
        });
        const { chart: blank } = await createLogitLensChartPair(def.id, lensConfig(""));
        await db
            .update(charts)
            .set({ data: { sourcePrompt: "Only Patch Lens keeps prompts on the chart" } })
            .where(eq(charts.id, blank.id));

        const library = await getWorkspaceLibrary(USER);
        const promptOf = (id: string) =>
            library.defaultItems.find((i) => i.id === id && i.kind === "chart") as
                | Extract<LibraryItem, { kind: "chart" }>
                | undefined;
        expect(promptOf(lens)?.prompt).toBe("The Eiffel Tower is in");
        expect(promptOf(patch.id)?.prompt).toBe("The capital of France is");
        expect(promptOf(blank.id)?.prompt).toBeNull();
    });

    it("lists a folder's items in the order they were reordered to", async () => {
        const folder = await createWorkspace(USER, "Folder");
        const first = await createChart(folder.id, "First");
        const second = await createChart(folder.id, "Second");
        const report = await createDocument(USER, folder.id);

        await reorderWorkspaceItems(USER, folder.id, [
            { kind: "report", id: report.id },
            { kind: "chart", id: second },
            { kind: "chart", id: first },
        ]);

        const library = await getWorkspaceLibrary(USER);
        expect(ids(library.workspaces[0].items)).toEqual([report.id, second, first]);
    });

    it("reorders only the user's own workspace, and only the items in it", async () => {
        const mine = await createWorkspace(USER, "Mine");
        const theirs = await createWorkspace(OTHER, "Theirs");
        const myFirst = await createChart(mine.id, "First");
        const mySecond = await createChart(mine.id, "Second");
        const theirFirst = await createChart(theirs.id, "Their first");
        const theirSecond = await createChart(theirs.id, "Their second");
        const positions = async (workspaceId: string) =>
            (
                await db
                    .select({ id: charts.id, position: charts.position })
                    .from(charts)
                    .where(eq(charts.workspaceId, workspaceId))
            )
                .sort((a: { position: number }, b: { position: number }) => a.position - b.position)
                .map((c: { id: string }) => c.id);

        await expect(
            reorderWorkspaceItems(USER, theirs.id, [
                { kind: "chart", id: theirSecond },
                { kind: "chart", id: theirFirst },
            ]),
        ).rejects.toThrow("access denied");
        expect(await positions(theirs.id)).toEqual([theirFirst, theirSecond]);

        await reorderWorkspaceItems(USER, mine.id, [
            { kind: "chart", id: theirSecond },
            { kind: "chart", id: mySecond },
            { kind: "chart", id: myFirst },
        ]);
        expect(await positions(mine.id)).toEqual([mySecond, myFirst]);
        expect(await positions(theirs.id)).toEqual([theirFirst, theirSecond]);
    });

    it("creates the default workspace on first read", async () => {
        const library = await getWorkspaceLibrary(USER);
        expect(library.defaultItems).toEqual([]);
        expect(library.workspaces).toEqual([]);
        expect((await getWorkspaceById(library.defaultWorkspaceId!))!.isDefault).toBe(true);
    });

    it("never creates a default workspace for a workshop participant", async () => {
        const workshop = await createWorkshop(workshopInput());
        const ws = await createWorkspace(USER, "Pilot", workshop.id);
        const chartId = await createChart(ws.id, "Guided");

        const library = await getWorkspaceLibrary(USER, { createDefault: false });

        expect(library.defaultWorkspaceId).toBeNull();
        expect(library.defaultItems).toEqual([]);
        expect(library.workspaces.map((w) => [w.id, ids(w.items)])).toEqual([[ws.id, [chartId]]]);
        const defaults = await db
            .select()
            .from(workspaces)
            .where(and(eq(workspaces.userId, USER), eq(workspaces.isDefault, true)));
        expect(defaults).toEqual([]);
    });

    it("flags workshop workspaces", async () => {
        const workshop = await createWorkshop(workshopInput());
        const ws = await createWorkspace(USER, "Pilot", workshop.id);
        const library = await getWorkspaceLibrary(USER);
        expect(library.workspaces).toMatchObject([{ id: ws.id, isWorkshop: true }]);
    });
});

describe("moves", () => {
    beforeEach(async () => {
        await clearDatabase();
    });

    it("moves a chart with its config and lens runs to the end of the target", async () => {
        const def = await getOrCreateDefaultWorkspace(USER);
        const folder = await createWorkspace(USER, "Folder");
        await createChart(folder.id, "Already here");
        await createDocument(USER, folder.id);
        const chartId = await createChart(def.id, "Mover");
        await insertLensRun(def.id, chartId);
        await insertLensRun(def.id, chartId);
        const [before] = await db.select().from(charts).where(eq(charts.id, chartId));

        await moveChart(USER, chartId, folder.id);

        const [moved] = await db.select().from(charts).where(eq(charts.id, chartId));
        expect(moved.workspaceId).toBe(folder.id);
        expect(moved.position).toBe(2);
        expect(moved.updatedAt.getTime()).toBe(before.updatedAt.getTime());
        expect((await getConfigForChart(chartId))!.workspaceId).toBe(folder.id);
        const runs = await db.select().from(lensRuns).where(eq(lensRuns.chartId, chartId));
        expect(runs.map((r: { workspaceId: string }) => r.workspaceId)).toEqual([
            folder.id,
            folder.id,
        ]);
        expect((await getChartWorkspaceScope(chartId))!.workspaceId).toBe(folder.id);

        // A null target is the default workspace.
        await moveChart(USER, chartId, null);
        expect((await getConfigForChart(chartId))!.workspaceId).toBe(def.id);
        expect((await getChartWorkspaceScope(chartId))!).toEqual({
            workspaceId: def.id,
            name: DEFAULT_WORKSPACE_NAME,
            workshopId: null,
            isDefault: true,
        });
    });

    it("files a run or config saved from a page that predates the move under the chart's workspace", async () => {
        const def = await getOrCreateDefaultWorkspace(USER);
        const folder = await createWorkspace(USER, "Folder");
        const chartId = await createChart(def.id, "Mover");
        const config = (await getConfigForChart(chartId))!;
        await moveChart(USER, chartId, folder.id);

        const run = await createLensRun({
            workspaceId: def.id,
            chartId,
            model: "gpt2",
            summary: {} as LensRunSummary,
            heatmaps: {} as LensRunHeatmaps,
        });
        await setConfig(config.id, {
            workspaceId: def.id,
            type: "logit-lens",
            data: lensConfig("Edited after the move"),
        });

        expect(run.workspaceId).toBe(folder.id);
        const saved = (await getConfigForChart(chartId))!;
        expect(saved.workspaceId).toBe(folder.id);
        expect(saved.data).toMatchObject({ prompt: "Edited after the move" });
    });

    it("leaves other charts' configs and runs alone", async () => {
        const def = await getOrCreateDefaultWorkspace(USER);
        const folder = await createWorkspace(USER, "Folder");
        const mover = await createChart(def.id, "Mover");
        const stayer = await createChart(def.id, "Stayer");
        await insertLensRun(def.id, stayer);

        await moveChart(USER, mover, folder.id);

        expect((await getConfigForChart(stayer))!.workspaceId).toBe(def.id);
        const stayerConfigs = await db
            .select()
            .from(configs)
            .where(eq(configs.workspaceId, def.id));
        expect(stayerConfigs.length).toBe(1);
        const runs = await db.select().from(lensRuns).where(eq(lensRuns.chartId, stayer));
        expect(runs[0].workspaceId).toBe(def.id);
    });

    it("moves a report to the end of the target", async () => {
        const def = await getOrCreateDefaultWorkspace(USER);
        const folder = await createWorkspace(USER, "Folder");
        await createChart(folder.id, "Already here");
        const report = await createDocument(USER, def.id);

        await moveReport(USER, report.id, folder.id);

        const [moved] = await db.select().from(documents).where(eq(documents.id, report.id));
        expect(moved.workspaceId).toBe(folder.id);
        expect(moved.position).toBe(1);
        expect((await getReportWorkspaceScope(report.id))!.workspaceId).toBe(folder.id);

        await moveReport(USER, report.id, null);
        expect((await getReportWorkspaceScope(report.id))!.workspaceId).toBe(def.id);
    });

    it("refuses moves across users", async () => {
        const mine = await createWorkspace(USER, "Mine");
        const theirs = await createWorkspace(OTHER, "Theirs");
        const myChart = await createChart(mine.id, "Mine");
        const theirChart = await createChart(theirs.id, "Theirs");
        const theirReport = await createDocument(OTHER, theirs.id);

        await expect(moveChart(USER, myChart, theirs.id)).rejects.toThrow("access denied");
        await expect(moveChart(USER, theirChart, mine.id)).rejects.toThrow("access denied");
        await expect(moveChart(USER, theirChart, null)).rejects.toThrow("access denied");
        await expect(moveReport(USER, theirReport.id, mine.id)).rejects.toThrow("access denied");

        expect((await getChartWorkspaceScope(myChart))!.workspaceId).toBe(mine.id);
        expect((await getChartWorkspaceScope(theirChart))!.workspaceId).toBe(theirs.id);
        expect((await getConfigForChart(theirChart))!.workspaceId).toBe(theirs.id);
    });

    it("refuses moves into or out of workshop workspaces", async () => {
        const workshop = await createWorkshop(workshopInput());
        const workshopWs = await createWorkspace(USER, "Pilot", workshop.id);
        const folder = await createWorkspace(USER, "Folder");
        const workshopChart = await createChart(workshopWs.id, "Guided");
        const folderChart = await createChart(folder.id, "Mine");
        const folderReport = await createDocument(USER, folder.id);

        await expect(moveChart(USER, workshopChart, folder.id)).rejects.toThrow("workshop");
        await expect(moveChart(USER, workshopChart, null)).rejects.toThrow("workshop");
        await expect(moveChart(USER, folderChart, workshopWs.id)).rejects.toThrow("workshop");
        await expect(moveReport(USER, folderReport.id, workshopWs.id)).rejects.toThrow("workshop");

        expect((await getChartWorkspaceScope(workshopChart))!.workspaceId).toBe(workshopWs.id);
        expect((await getChartWorkspaceScope(folderChart))!.workspaceId).toBe(folder.id);
    });

    it("throws for a missing chart or report", async () => {
        await expect(moveChart(USER, "missing", null)).rejects.toThrow("Chart not found");
        await expect(moveReport(USER, "missing", null)).rejects.toThrow("Report not found");
    });
});

describe("lookups by an id from a URL", () => {
    beforeEach(async () => {
        await clearDatabase();
    });

    it("recognise row ids by their UUID shape", async () => {
        const ws = await createWorkspace(USER, "Folder");
        expect(isUuid(ws.id)).toBe(true);
        expect(isUuid(ws.id.toUpperCase())).toBe(true);
        for (const malformed of ["", "not-a-uuid", `${ws.id}x`, ws.id.slice(1), "1 or 1=1"]) {
            expect(isUuid(malformed)).toBe(false);
        }
    });

    it("find nothing for a malformed id", async () => {
        const ws = await createWorkspace(USER, "Folder");
        const chartId = await createChart(ws.id, "Chart");
        const report = await createDocument(USER, ws.id);

        expect(await getWorkspaceById(ws.id)).not.toBeNull();
        expect(await getChartWorkspaceScope(chartId)).not.toBeNull();
        expect(await getReportWorkspaceScope(report.id)).not.toBeNull();
        for (const malformed of ["not-a-uuid", `${chartId}'`, "%E2%80%A6"]) {
            expect(await getWorkspaceById(malformed)).toBeNull();
            expect(await getChartWorkspaceScope(malformed)).toBeNull();
            expect(await getReportWorkspaceScope(malformed)).toBeNull();
        }
    });
});

describe("most recent chart", () => {
    beforeEach(async () => {
        await clearDatabase();
    });

    it("skips workshop workspaces and other users", async () => {
        const workshop = await createWorkshop(workshopInput());
        const workshopWs = await createWorkspace(USER, "Pilot", workshop.id);
        const def = await getOrCreateDefaultWorkspace(USER);
        const theirs = await createWorkspace(OTHER, "Theirs");

        expect(await getMostRecentUserChart(USER)).toBeNull();

        const mine = await createChart(def.id, "Mine");
        const guided = await createChart(workshopWs.id, "Guided");
        const other = await createChart(theirs.id, "Theirs");
        await setChartUpdatedAt(mine, 60);
        await setChartUpdatedAt(guided, 0);
        await setChartUpdatedAt(other, 0);

        expect(await getMostRecentUserChart(USER)).toEqual({
            chartId: mine,
            toolType: "logit-lens",
        });
    });
});
