/**
 * Integration tests for `createChartFromLaunch` (chartDb.ts), the chart a
 * `/new?tool=…` launch creates, on SQLite: where it is filed, which
 * workspaces it may go into, and the workshop tool allowlist.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import { db, clearDatabase } from "../client";
import { charts, workspaces } from "../schema";
import { createChartFromLaunch, getMostRecentChartForWorkspace } from "@/lib/queries/chartDb";
import { getConfigForChart } from "@/lib/queries/chartQueries";
import { createWorkshop } from "@/lib/queries/workshopDb";
import { createWorkspace, getOrCreateDefaultWorkspace } from "@/lib/queries/workspaceDb";
import type { WorkshopTool } from "@/db/schema";

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
});
