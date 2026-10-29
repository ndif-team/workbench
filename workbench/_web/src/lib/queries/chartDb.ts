import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { chartConfigLinks, charts, configs, workspaces } from "@/db/schema";
import type { Chart, Config, Workshop, WorkshopTool } from "@/db/schema";
import { planChartLaunch, type ChartLaunchRequest } from "@/lib/chartLaunch";
import { getWorkshopForWorkspace } from "@/lib/queries/workshopDb";
import {
    getNextWorkspaceItemPosition,
    getOrCreateDefaultWorkspace,
    getWorkspaceById,
    touchWorkspace,
} from "@/lib/queries/workspaceDb";
import type { ActivationPatchingConfigData } from "@/types/activationPatching";
import {
    LEGACY_TOOL_ALIASES,
    normalizeToolType,
    toolTypes,
    type ChartData,
    type ChartType,
    type ToolType,
} from "@/types/charts";
import type { JLensConfigData } from "@/types/jlens";
import type { LogitLensConfigData } from "@/types/logitLens";
import type { PatchLensChartData } from "@/types/patchLens";

/**
 * Unguarded chart DB internals. The "use server" RPC surface lives in
 * chartQueries.ts, which resolves the signed-in user before calling these.
 * Writes keyed by a chart id take the user and touch only charts in that
 * user's workspaces.
 */

/** A chart or config row with a legacy tool type read under its current name. */
export const withCurrentToolType = <R extends { type: string | null }>(row: R): R =>
    ({ ...row, type: normalizeToolType(row.type) }) as R;

/** The chart `chartId`, as a filter that matches only when it is in one of the user's workspaces. */
const isUserChart = (userId: string, chartId: string) =>
    and(
        eq(charts.id, chartId),
        inArray(
            charts.workspaceId,
            db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.userId, userId)),
        ),
    );

const chartNotFound = () => new Error("Chart not found or access denied");

type ConfigPayload =
    | { type: "logit-lens"; data: LogitLensConfigData }
    | { type: "jlens"; data: JLensConfigData }
    | { type: "activation-patching"; data: ActivationPatchingConfigData }
    | { type: "patch-lens"; data: Record<string, never> };

/**
 * Creates a chart, its config and the link between them, with the chart at
 * the end of its workspace. `chartData` seeds the chart row's `data`
 * (patch-lens keeps its prompts there, not on the config). Workshop
 * workspaces only allow their configured tools, enforced here because every
 * chart creation goes through this function.
 */
export const createChartConfigPair = async (
    workspaceId: string,
    payload: ConfigPayload,
    chartData?: ChartData,
): Promise<{ chart: Chart; config: Config }> => {
    const workshop = await getWorkshopForWorkspace(workspaceId);
    if (workshop && !(workshop.allowedTools as string[]).includes(payload.type)) {
        throw new Error(`This workshop does not allow the "${payload.type}" tool`);
    }
    const position = await getNextWorkspaceItemPosition(workspaceId);
    const [newChart] = await db
        .insert(charts)
        .values({ workspaceId, position, ...(chartData !== undefined ? { data: chartData } : {}) })
        .returning();
    const [newConfig] = await db
        .insert(configs)
        .values({ workspaceId, type: payload.type, data: payload.data })
        .returning();
    await db.insert(chartConfigLinks).values({ chartId: newChart.id, configId: newConfig.id });
    await touchWorkspace(workspaceId);
    return { chart: newChart as Chart, config: newConfig as Config };
};

export const createLogitLensChartPair = async (
    workspaceId: string,
    defaultConfig: LogitLensConfigData,
) => createChartConfigPair(workspaceId, { type: "logit-lens", data: defaultConfig });

export const createJLensChartPair = async (workspaceId: string, defaultConfig: JLensConfigData) =>
    createChartConfigPair(workspaceId, { type: "jlens", data: defaultConfig });

export const createPatchLensChartPair = async (
    workspaceId: string,
    chartData?: PatchLensChartData,
) => createChartConfigPair(workspaceId, { type: "patch-lens", data: {} }, chartData);

export const createActivationPatchingChartPair = async (
    workspaceId: string,
    defaultConfig: ActivationPatchingConfigData,
) => createChartConfigPair(workspaceId, { type: "activation-patching", data: defaultConfig });

/** Who is adding a chart: an anonymous workshop participant may only add to a workshop workspace. */
type ChartCreator = { workshopParticipant?: boolean };

const participantOutsideWorkshop = () =>
    new Error("Workshop participants can only add charts to their workshop");

/**
 * Checks that the user may add a chart to `workspaceId` and returns it: the
 * workspace must be theirs, and a workshop participant's must be a workshop
 * workspace. (Which tools it allows is checked when the chart is created.)
 */
export const assertChartWorkspace = async (
    userId: string,
    workspaceId: string,
    { workshopParticipant = false }: ChartCreator = {},
) => {
    const workspace = await getWorkspaceById(workspaceId);
    if (!workspace || workspace.userId !== userId) {
        throw new Error("Workspace not found or access denied");
    }
    if (workshopParticipant && !workspace.workshopId) throw participantOutsideWorkshop();
    return workspace.id;
};

/**
 * Creates the chart a `/new` launch asks for: in `request.workspaceId` when
 * that workspace is the user's, else in their default workspace (created on
 * first use). A workshop participant must name their workshop workspace and
 * one of its tools. Returns where to open it.
 */
export const createChartFromLaunch = async (
    userId: string,
    request: ChartLaunchRequest,
    creator: ChartCreator = {},
): Promise<{ chartId: string; toolType: ToolType; workspaceId: string }> => {
    if (creator.workshopParticipant && !request.workspaceId) throw participantOutsideWorkshop();
    const workspaceId = request.workspaceId
        ? await assertChartWorkspace(userId, request.workspaceId, creator)
        : (await getOrCreateDefaultWorkspace(userId)).id;

    const plan = planChartLaunch(request);
    const chartData = plan.type === "patch-lens" ? plan.chartData : undefined;
    const { chart } = await createChartConfigPair(workspaceId, plan, chartData);
    return { chartId: chart.id, toolType: plan.type, workspaceId };
};

/**
 * Creates the first chart for a workshop workspace: the workshop's first
 * allowed tool, pinned to its model, seeded with its starter prompt. Shared by
 * the join action and the open-workspace page.
 */
export const seedWorkshopChart = async (
    workspaceId: string,
    workshop: Workshop,
): Promise<{ chart: Chart; tool: WorkshopTool }> => {
    const tool = workshop.allowedTools[0] ?? "logit-lens";

    if (tool === "activation-patching") {
        const { chart } = await createActivationPatchingChartPair(workspaceId, {
            model: workshop.model,
            srcPrompt: workshop.starterPrompt,
            tgtPrompt: "",
            srcPos: [],
            tgtPos: [],
            tgtFreeze: [],
        });
        return { chart, tool };
    }

    if (tool === "patch-lens") {
        // Patch-lens configs are empty ({}); its model comes from the workspace
        // store, which ModelControl pins for workshop workspaces. The prompts
        // live on the chart row's `data`, so the starter prompt seeds there.
        const { chart } = await createPatchLensChartPair(workspaceId, {
            sourcePrompt: workshop.starterPrompt,
            targetPrompt: "",
        });
        return { chart, tool };
    }

    const { chart } = await createLogitLensChartPair(workspaceId, {
        model: workshop.model,
        prompt: workshop.starterPrompt,
        topk: 5,
        includeEntropy: true,
    });
    return { chart, tool };
};

/** Saves a run's result on one of the user's charts. */
export const setChartData = async (
    userId: string,
    chartId: string,
    chartData: ChartData,
    chartType: ChartType,
): Promise<void> => {
    const [chart] = await db
        .update(charts)
        .set({ data: chartData, type: normalizeToolType(chartType) })
        .where(isUserChart(userId, chartId))
        .returning({ workspaceId: charts.workspaceId });
    if (!chart) throw chartNotFound();
    await touchWorkspace(chart.workspaceId);
};

/** Renames one of the user's charts. */
export const renameChart = async (userId: string, chartId: string, name: string): Promise<void> => {
    const renamed = await db
        .update(charts)
        .set({ name })
        .where(isUserChart(userId, chartId))
        .returning({ id: charts.id });
    if (renamed.length === 0) throw chartNotFound();
};

/** Deletes one of the user's charts. */
export const deleteChart = async (userId: string, chartId: string): Promise<void> => {
    const deleted = await db
        .delete(charts)
        .where(isUserChart(userId, chartId))
        .returning({ id: charts.id });
    if (deleted.length === 0) throw chartNotFound();
};

/**
 * Copies one of the user's charts, with its config, to the end of its
 * workspace. A Patch Lens copy starts without run history, so it drops the
 * pointer to the source's active lens run.
 */
export const copyChart = async (userId: string, chartId: string): Promise<Chart> => {
    const [originalChart] = await db.select().from(charts).where(isUserChart(userId, chartId));
    if (!originalChart) throw chartNotFound();

    const [originalLink] = await db
        .select()
        .from(chartConfigLinks)
        .where(eq(chartConfigLinks.chartId, chartId));

    const [originalConfig] = await db
        .select()
        .from(configs)
        .where(eq(configs.id, originalLink.configId));

    let copiedData = originalChart.data;
    if (originalChart.type === "patch-lens" && copiedData && typeof copiedData === "object") {
        const rest = { ...(copiedData as Record<string, unknown>) };
        delete rest.activeLensRunId;
        copiedData = rest as typeof originalChart.data;
    }

    const position = await getNextWorkspaceItemPosition(originalChart.workspaceId);
    const [newChart] = await db
        .insert(charts)
        .values({
            workspaceId: originalChart.workspaceId,
            name: `Copy of ${originalChart.name}`,
            data: copiedData,
            type: normalizeToolType(originalChart.type),
            position,
        })
        .returning();

    const [newConfig] = await db
        .insert(configs)
        .values({
            workspaceId: originalConfig.workspaceId,
            type: normalizeToolType(originalConfig.type),
            data: originalConfig.data,
        })
        .returning();

    await db.insert(chartConfigLinks).values({
        chartId: newChart.id,
        configId: newConfig.id,
    });

    return newChart as Chart;
};

/**
 * The workspace's most recently updated chart of a live tool, with that tool.
 * A chart's tool is its config's type, or the chart's own type when it has no
 * config. Charts of retired tools are skipped, so the workspace root never
 * redirects to a chart page that no longer exists.
 */
export const getMostRecentChartForWorkspace = async (
    workspaceId: string,
): Promise<{ chart: Chart; toolType: ToolType } | null> => {
    const toolType = sql<string>`coalesce(${configs.type}, ${charts.type})`;
    const [row] = await db
        .select({ chart: charts, toolType })
        .from(charts)
        .leftJoin(chartConfigLinks, eq(charts.id, chartConfigLinks.chartId))
        .leftJoin(configs, eq(chartConfigLinks.configId, configs.id))
        .where(
            and(
                eq(charts.workspaceId, workspaceId),
                inArray(toolType, [...toolTypes, ...Object.keys(LEGACY_TOOL_ALIASES)]),
            ),
        )
        .orderBy(desc(charts.updatedAt))
        .limit(1);

    return row
        ? {
              chart: withCurrentToolType(row.chart as Chart),
              toolType: normalizeToolType(row.toolType) as ToolType,
          }
        : null;
};
