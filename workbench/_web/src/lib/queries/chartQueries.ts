"use server";

import type { ChartData, ChartMetadata, ChartView, ChartType, ToolType } from "@/types/charts";
import { db } from "@/db/client";
import { charts, configs, chartConfigLinks, workspaces, Chart, LensConfig, Config } from "@/db/schema";
import { LensConfigData } from "@/types/lens";
import { Lens2ConfigData } from "@/types/lens2";
import { PatchingConfig } from "@/types/patching";
import { ActivationPatchingConfigData } from "@/types/activationPatching";
import { PatchLensChartData } from "@/types/patchLens";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { touchWorkspace, getNextWorkspaceItemPosition } from "@/lib/queries/internal";
import {
    requireUserId,
    requireWorkspaceOwner,
    ownedByWorkspace,
    ForbiddenError,
} from "@/lib/auth/ownership";
// From workshopDb (not workshopQueries) — workshopQueries imports the chart
// pair creators below, so importing it back here would be circular.
import { getWorkshopForWorkspace } from "@/lib/queries/workshopDb";

export const setChartData = async (chartId: string, chartData: ChartData, chartType: ChartType) => {
    const userId = await requireUserId();
    const [chart] = await db
        .update(charts)
        .set({ data: chartData, type: chartType })
        .where(and(eq(charts.id, chartId), ownedByWorkspace(charts.workspaceId, userId)))
        .returning();
    if (chart) await touchWorkspace(chart.workspaceId);
};

export const updateChartName = async (chartId: string, name: string) => {
    const userId = await requireUserId();
    await db
        .update(charts)
        .set({ name })
        .where(and(eq(charts.id, chartId), ownedByWorkspace(charts.workspaceId, userId)));
};

export const getChartById = async (chartId: string): Promise<Chart | null> => {
    const userId = await requireUserId();
    const [chart] = await db
        .select()
        .from(charts)
        .where(and(eq(charts.id, chartId), ownedByWorkspace(charts.workspaceId, userId)));
    return (chart ?? null) as Chart | null;
};

export const getChartView = async (chartId: string): Promise<ChartView | null> => {
    const userId = await requireUserId();
    const [chart] = await db
        .select()
        .from(charts)
        .where(and(eq(charts.id, chartId), ownedByWorkspace(charts.workspaceId, userId)));
    return (chart?.view ?? null) as ChartView | null;
};

export const updateChartView = async (chartId: string, view: ChartView) => {
    const userId = await requireUserId();
    await db
        .update(charts)
        .set({ view })
        .where(and(eq(charts.id, chartId), ownedByWorkspace(charts.workspaceId, userId)));
};

export const deleteChart = async (chartId: string): Promise<void> => {
    const userId = await requireUserId();
    await db
        .delete(charts)
        .where(and(eq(charts.id, chartId), ownedByWorkspace(charts.workspaceId, userId)));
};

export const getConfigForChart = async (chartId: string): Promise<Config | null> => {
    const userId = await requireUserId();
    const rows = await db
        .select()
        .from(configs)
        .innerJoin(chartConfigLinks, eq(configs.id, chartConfigLinks.configId))
        .where(
            and(eq(chartConfigLinks.chartId, chartId), ownedByWorkspace(configs.workspaceId, userId)),
        )
        .limit(1);
    if (rows.length === 0) return null;
    return rows[0].configs as Config;
};

type ConfigPayload =
    | { type: "lens"; data: LensConfigData }
    | { type: "lens2"; data: Lens2ConfigData }
    | { type: "patch"; data: PatchingConfig }
    | { type: "activation-patching"; data: ActivationPatchingConfigData }
    | { type: "patch-lens"; data: Record<string, never> };

// Creates a chart, its config, and the link between them, with the chart
// positioned at the bottom of the unified sidebar list.
const createChartConfigPair = async (
    workspaceId: string,
    payload: ConfigPayload,
    // Optional seed for the chart row's `data` column. patch-lens stores its
    // prompts on the chart (not the config), so seeding a starter prompt for a
    // patch-lens chart flows through here.
    chartData?: ChartData,
): Promise<{ chart: Chart; config: Config }> => {
    // INSERT: no row to filter, so verify the parent workspace is owned before
    // writing the chart/config/link into it.
    await requireWorkspaceOwner(workspaceId);
    // Workshop workspaces only allow their configured tools. The sidebar
    // filters its buttons, but every create wrapper here is a public server
    // action, so the allowlist is enforced at the single shared entry point.
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

export const createLensChartPair = async (
    workspaceId: string,
    defaultConfig: LensConfigData,
): Promise<{ chart: Chart; config: LensConfig }> => {
    const result = await createChartConfigPair(workspaceId, { type: "lens", data: defaultConfig });
    return { chart: result.chart, config: result.config as LensConfig };
};

export const createLens2ChartPair = async (workspaceId: string, defaultConfig: Lens2ConfigData) =>
    createChartConfigPair(workspaceId, { type: "lens2", data: defaultConfig });

export const createPatchLensChartPair = async (
    workspaceId: string,
    chartData?: PatchLensChartData,
) => createChartConfigPair(workspaceId, { type: "patch-lens", data: {} }, chartData);

export const createPatchChartPair = async (workspaceId: string, defaultConfig: PatchingConfig) =>
    createChartConfigPair(workspaceId, { type: "patch", data: defaultConfig });

export const createActivationPatchingChartPair = async (
    workspaceId: string,
    defaultConfig: ActivationPatchingConfigData,
) => createChartConfigPair(workspaceId, { type: "activation-patching", data: defaultConfig });

export const getAllChartsByType = async (
    workspaceId?: string,
): Promise<Record<string, Chart[]>> => {
    const userId = await requireUserId();
    // Join charts with their configs to get the config type. Always scoped to
    // the caller's charts (the workspaceId arg only narrows further) — without
    // it, an omitted workspaceId would return every user's charts.
    const query = db
        .select({
            chart: charts,
            configType: configs.type,
        })
        .from(charts)
        .leftJoin(chartConfigLinks, eq(charts.id, chartConfigLinks.chartId))
        .leftJoin(configs, eq(chartConfigLinks.configId, configs.id));

    const ownership = ownedByWorkspace(charts.workspaceId, userId);
    const chartsWithConfigs = workspaceId
        ? await query.where(and(eq(charts.workspaceId, workspaceId), ownership))
        : await query.where(ownership);

    // Group charts by their config type
    const chartsByType: Record<string, Chart[]> = {};

    for (const { chart, configType } of chartsWithConfigs) {
        const type = configType || "unknown";
        if (!chartsByType[type]) {
            chartsByType[type] = [];
        }
        chartsByType[type].push(chart);
    }

    return chartsByType;
};

export const getChartsMetadata = async (workspaceId: string): Promise<ChartMetadata[]> => {
    const userId = await requireUserId();
    // Whether the chart has a saved result, derived cheaply from the column
    // being non-null (a freshly created chart has no `data` until it runs) so
    // we don't ship the heavy result payload into the lightweight sidebar list.
    // The sidebar uses this + the model to decide whether to show a deploying
    // card, matching `useChartModelReady` on the chart page.
    const hasData = sql<boolean>`${charts.data} is not null`;
    // NOTE: the row type is asserted below. Adding these extra select fields
    // tips drizzle's deeply-generic select inference past its complexity
    // threshold and it silently widens the result to `any`; the explicit cast
    // restores a typed, checked mapping.
    const rows = (await db
        .select({
            id: charts.id,
            name: charts.name,
            chartType: charts.type,
            position: charts.position,
            createdAt: charts.createdAt,
            updatedAt: charts.updatedAt,
            toolType: configs.type,
            configData: configs.data,
            hasData,
        })
        .from(charts)
        .leftJoin(chartConfigLinks, eq(charts.id, chartConfigLinks.chartId))
        .leftJoin(configs, eq(chartConfigLinks.configId, configs.id))
        .where(and(eq(charts.workspaceId, workspaceId), ownedByWorkspace(charts.workspaceId, userId)))
        .groupBy(
            charts.id,
            charts.createdAt,
            charts.updatedAt,
            charts.position,
            charts.type,
            charts.data,
            configs.type,
            configs.data,
        )
        .orderBy(asc(charts.position), asc(charts.createdAt))) as Array<{
        id: string;
        name: string | null;
        chartType: ChartType | null;
        position: number;
        createdAt: Date;
        updatedAt: Date;
        toolType: ToolType | null;
        configData: { model?: string } | null;
        hasData: boolean;
    }>;

    return rows.map(
        (r) =>
            ({
                id: r.id,
                name: r.name,
                chartType: r.chartType ?? null,
                toolType: r.toolType ?? null,
                position: r.position,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
                model: r.configData?.model ?? null,
                hasData: !!r.hasData,
            }) as ChartMetadata,
    );
};

export const getMostRecentChartForWorkspace = async (
    workspaceId: string,
): Promise<Chart | null> => {
    const userId = await requireUserId();
    const [chart] = await db
        .select()
        .from(charts)
        .where(and(eq(charts.workspaceId, workspaceId), ownedByWorkspace(charts.workspaceId, userId)))
        .orderBy(desc(charts.updatedAt))
        .limit(1);

    return (chart ?? null) as Chart | null;
};

export const copyChart = async (chartId: string): Promise<Chart> => {
    // INSERT rooted at an existing chart: the copy lands in the same (owned)
    // workspace. One ownership-scoped full-row fetch — the join to workspaces both
    // authorizes the caller and returns every column the copy needs.
    const userId = await requireUserId();
    const [row] = await db
        .select()
        .from(charts)
        .innerJoin(workspaces, eq(charts.workspaceId, workspaces.id))
        .where(and(eq(charts.id, chartId), eq(workspaces.userId, userId)))
        .limit(1);
    if (!row) {
        throw new ForbiddenError("Chart not found or access denied");
    }
    const originalChart = row.charts;

    // Get the config associated with the original chart
    const [originalLink] = await db
        .select()
        .from(chartConfigLinks)
        .where(eq(chartConfigLinks.chartId, chartId));

    const [originalConfig] = await db
        .select()
        .from(configs)
        .where(eq(configs.id, originalLink.configId));

    // Create the new chart with copied data. For patch-lens, drop the pointer to
    // the source chart's active lens run so the copy starts without history.
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
            type: originalChart.type,
            view: originalChart.view,
            position,
        })
        .returning();

    // Copy the config and create a new link
    const [newConfig] = await db
        .insert(configs)
        .values({
            workspaceId: originalConfig.workspaceId,
            type: originalConfig.type,
            data: originalConfig.data,
        })
        .returning();

    // Create the link between new chart and new config
    await db.insert(chartConfigLinks).values({
        chartId: newChart.id,
        configId: newConfig.id,
    });

    return newChart as Chart;
};
