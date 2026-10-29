/**
 * Integration tests for `createChartFromLaunch` (chartDb.ts), the chart a
 * `/new?tool=…` launch creates, on SQLite: where it is filed, which
 * workspaces it may go into, the workshop tool allowlist, and when a blank
 * launch reopens an untouched chart instead of adding one.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import { db, clearDatabase } from "../client";
import { chartConfigLinks, charts, configs, lensRuns, workspaces } from "../schema";
import { createChartFromLaunch, getMostRecentChartForWorkspace } from "@/lib/queries/chartDb";
import { getConfigForChart } from "@/lib/queries/chartQueries";
import { createWorkshop } from "@/lib/queries/workshopDb";
import { createWorkspace, getOrCreateDefaultWorkspace, moveChart } from "@/lib/queries/workspaceDb";
import type { WorkshopTool } from "@/db/schema";
import type { LensRunHeatmaps, LensRunSummary } from "@/types/lensRun";

const USER = "user-a";
const OTHER = "user-b";

const workshopInput = (allowedTools: WorkshopTool[]) => ({
    name: "Pilot",
    allowedTools,
    model: "gpt2",
    starterPrompt: "",
    allowModelChange: false,
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    createdBy: "admin@example.edu",
});

const chartCount = async () => (await db.select({ id: charts.id }).from(charts)).length;

describe("createChartFromLaunch", () => {
    beforeEach(async () => {
        await clearDatabase();
    });

    it("files the chart in the default workspace, creating it on first use", async () => {
        const launched = await createChartFromLaunch(USER, {
            tool: "Logit Lens",
            model: "gpt2",
            prompt: "The Eiffel Tower is in",
        });

        const def = await getOrCreateDefaultWorkspace(USER);
        expect(launched).toEqual({
            chartId: launched.chartId,
            toolType: "logit-lens",
            workspaceId: def.id,
        });
        const defaults = await db.select().from(workspaces).where(eq(workspaces.userId, USER));
        expect(defaults.length).toBe(1);
        expect((await getConfigForChart(launched.chartId))!.data).toMatchObject({
            model: "gpt2",
            prompt: "The Eiffel Tower is in",
        });
    });

    it("files the chart in a workspace of the user's that the launch names", async () => {
        const folder = await createWorkspace(USER, "Folder");

        const launched = await createChartFromLaunch(USER, {
            tool: "patch-lens",
            srcPrompt: "The capital of France is",
            workspaceId: folder.id,
        });

        expect(launched.workspaceId).toBe(folder.id);
        expect(launched.toolType).toBe("patch-lens");
        expect((await getMostRecentChartForWorkspace(folder.id))!.chart.id).toBe(launched.chartId);
    });

    it("refuses another user's workspace", async () => {
        const theirs = await createWorkspace(OTHER, "Theirs");

        await expect(
            createChartFromLaunch(USER, { tool: "Logit Lens", workspaceId: theirs.id }),
        ).rejects.toThrow("access denied");
        await expect(
            createChartFromLaunch(USER, { tool: "Logit Lens", workspaceId: "missing" }),
        ).rejects.toThrow("access denied");
        expect(await chartCount()).toBe(0);
    });

    it("keeps a workshop participant to their workshop workspace and its tools", async () => {
        const workshop = await createWorkshop(workshopInput(["patch-lens"]));
        const ws = await createWorkspace(USER, "Pilot", workshop.id);
        const folder = await createWorkspace(USER, "Folder");
        const participant = { workshopParticipant: true };

        await expect(
            createChartFromLaunch(USER, { tool: "patch-lens" }, participant),
        ).rejects.toThrow("only add charts to their workshop");
        await expect(
            createChartFromLaunch(
                USER,
                { tool: "patch-lens", workspaceId: folder.id },
                participant,
            ),
        ).rejects.toThrow("only add charts to their workshop");
        await expect(
            createChartFromLaunch(USER, { tool: "Logit Lens", workspaceId: ws.id }, participant),
        ).rejects.toThrow('does not allow the "logit-lens" tool');
        expect(await chartCount()).toBe(0);
        const defaults = await db.select().from(workspaces).where(eq(workspaces.isDefault, true));
        expect(defaults).toEqual([]);

        const launched = await createChartFromLaunch(
            USER,
            { tool: "patch-lens", workspaceId: ws.id },
            participant,
        );
        expect(launched.workspaceId).toBe(ws.id);
    });

    it("enforces a workshop workspace's allowed tools", async () => {
        const workshop = await createWorkshop(workshopInput(["patch-lens"]));
        const ws = await createWorkspace(USER, "Pilot", workshop.id);

        await expect(
            createChartFromLaunch(USER, { tool: "Logit Lens", workspaceId: ws.id }),
        ).rejects.toThrow('does not allow the "logit-lens" tool');
        expect(await chartCount()).toBe(0);

        const launched = await createChartFromLaunch(USER, {
            tool: "patch-lens",
            workspaceId: ws.id,
        });
        expect(launched.workspaceId).toBe(ws.id);
    });

    describe("a blank launch (a tool and nothing else)", () => {
        const blank = { tool: "logit-lens" };
        const configOf = async (chartId: string) =>
            (
                await db
                    .select({ id: configs.id, data: configs.data })
                    .from(chartConfigLinks)
                    .innerJoin(configs, eq(chartConfigLinks.configId, configs.id))
                    .where(eq(chartConfigLinks.chartId, chartId))
            )[0];

        it("reopens the newest untouched chart of that tool instead of adding one", async () => {
            const older = await createChartFromLaunch(USER, blank);
            const newer = await createChartFromLaunch(USER, { tool: "jlens" });
            await db
                .update(charts)
                .set({ updatedAt: new Date(Date.now() - 60_000) })
                .where(eq(charts.id, older.chartId));

            const again = await createChartFromLaunch(USER, blank);

            expect(again).toEqual(older);
            expect(await chartCount()).toBe(2);
            const [reopened] = await db.select().from(charts).where(eq(charts.id, older.chartId));
            const [other] = await db.select().from(charts).where(eq(charts.id, newer.chartId));
            expect(reopened.updatedAt.getTime()).toBeGreaterThanOrEqual(other.updatedAt.getTime());
        });

        it("adds a chart when the blank one has been named, run, edited or filed", async () => {
            const named = await createChartFromLaunch(USER, blank);
            await db.update(charts).set({ name: "Mine" }).where(eq(charts.id, named.chartId));
            const run = await createChartFromLaunch(USER, blank);
            expect(run.chartId).not.toBe(named.chartId);
            await db
                .update(charts)
                .set({ data: { meta: {} } as never })
                .where(eq(charts.id, run.chartId));
            const edited = await createChartFromLaunch(USER, blank);
            expect([named.chartId, run.chartId]).not.toContain(edited.chartId);
            const config = await configOf(edited.chartId);
            await db
                .update(configs)
                .set({ data: { ...(config.data as object), prompt: "The Eiffel Tower is in" } })
                .where(eq(configs.id, config.id));
            const filed = await createChartFromLaunch(USER, blank);
            expect([named.chartId, run.chartId, edited.chartId]).not.toContain(filed.chartId);
            await moveChart(USER, filed.chartId, (await createWorkspace(USER, "Folder")).id);

            const fresh = await createChartFromLaunch(USER, blank);

            expect([named.chartId, run.chartId, edited.chartId, filed.chartId]).not.toContain(
                fresh.chartId,
            );
            expect(await chartCount()).toBe(5);
        });

        it("adds a chart when the blank one has lens runs", async () => {
            const patch = await createChartFromLaunch(USER, { tool: "patch-lens" });
            await db.insert(lensRuns).values({
                workspaceId: patch.workspaceId,
                chartId: patch.chartId,
                model: "gpt2",
                summary: {} as LensRunSummary,
                data: {} as LensRunHeatmaps,
            });

            const again = await createChartFromLaunch(USER, { tool: "patch-lens" });

            expect(again.chartId).not.toBe(patch.chartId);
        });

        it("only reuses for blank launches into the default workspace", async () => {
            const first = await createChartFromLaunch(USER, blank);
            const withPrompt = await createChartFromLaunch(USER, { ...blank, prompt: "Paris" });
            const otherModel = await createChartFromLaunch(USER, { ...blank, model: "gpt2" });
            const folder = await createWorkspace(USER, "Folder");
            const inFolder = await createChartFromLaunch(USER, {
                ...blank,
                workspaceId: folder.id,
            });
            const againInFolder = await createChartFromLaunch(USER, {
                ...blank,
                workspaceId: folder.id,
            });

            const ids = [first, withPrompt, otherModel, inFolder, againInFolder].map(
                (l) => l.chartId,
            );
            expect(new Set(ids).size).toBe(5);
            expect((await createChartFromLaunch(USER, { ...blank, model: "gpt2" })).chartId).toBe(
                otherModel.chartId,
            );
        });
    });
});
