"use server";

import { toolTypes } from "@/types/charts";
import type { ChartData, ChartMetadata, ChartType, ToolType } from "@/types/charts";
import { db } from "@/db/client";
import { charts, configs, chartConfigLinks, Chart, Config } from "@/db/schema";
import { Lens2ConfigData } from "@/types/lens2";
import { JLensConfigData } from "@/types/jlens";
import { ActivationPatchingConfigData } from "@/types/activationPatching";
import { PatchLensChartData } from "@/types/patchLens";
import { and, eq, asc, desc, inArray, sql } from "drizzle-orm";
import { touchWorkspace, getNextWorkspaceItemPosition } from "@/lib/queries/workspaceQueries";
// From workshopDb (not workshopQueries) — workshopQueries imports the chart
// pair creators below, so importing it back here would be circular.
import { getWorkshopForWorkspace } from "@/lib/queries/workshopDb";

export const setChartData = async (chartId: string, chartData: ChartData, chartType: ChartType) => {
    const [chart] = await db
        .update(charts)
        .set({ data: chartData, type: chartType })
        .where(eq(charts.id, chartId))
        .returning();
    if (chart) await touchWorkspace(chart.workspaceId);
};

export const updateChartName = async (chartId: string, name: string) => {
    await db.update(charts).set({ name }).where(eq(charts.id, chartId));
};

export const getChartById = async (chartId: string): Promise<Chart | null> => {
    const [chart] = await db.select().from(charts).where(eq(charts.id, chartId));
    return (chart ?? null) as Chart | null;
};

export const deleteChart = async (chartId: string): Promise<void> => {
    await db.delete(charts).where(eq(charts.id, chartId));
};

export const getConfigForChart = async (chartId: string): Promise<Config | null> => {
    const rows = await db
        .select()
        .from(configs)
        .innerJoin(chartConfigLinks, eq(configs.id, chartConfigLinks.configId))
        .where(eq(chartConfigLinks.chartId, chartId))
        .limit(1);
    if (rows.length === 0) return null;
    return rows[0].configs as Config;
};

type ConfigPayload =
    | { type: "lens2"; data: Lens2ConfigData }
    | { type: "jlens"; data: JLensConfigData }
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

export const createLens2ChartPair = async (workspaceId: string, defaultConfig: Lens2ConfigData) =>
    createChartConfigPair(workspaceId, { type: "lens2", data: defaultConfig });

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

export const getChartsMetadata = async (workspaceId: string): Promise<ChartMetadata[]> => {
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
        .where(eq(charts.workspaceId, workspaceId))
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

/**
 * The workspace's most recently updated chart of a live tool, with that tool.
 * A chart's tool is its config's type, or the chart's own type when it has no
 * config. Charts of retired tools are skipped, so the workspace root never
 * redirects to a chart page that no longer exists.
 */
export const getMostRecentChartForWorkspace = async (
    workspaceId: string,
): Promise<{ chart: Chart; toolType: ToolType } | null> => {
    const toolType = sql<ToolType>`coalesce(${configs.type}, ${charts.type})`;
    const [row] = await db
        .select({ chart: charts, toolType })
        .from(charts)
        .leftJoin(chartConfigLinks, eq(charts.id, chartConfigLinks.chartId))
        .leftJoin(configs, eq(chartConfigLinks.configId, configs.id))
        .where(and(eq(charts.workspaceId, workspaceId), inArray(toolType, [...toolTypes])))
        .orderBy(desc(charts.updatedAt))
        .limit(1);

    return row ? { chart: row.chart as Chart, toolType: row.toolType } : null;
};

export const copyChart = async (chartId: string): Promise<Chart> => {
    // Get the original chart
    const [originalChart] = await db.select().from(charts).where(eq(charts.id, chartId));
    if (!originalChart) {
        throw new Error("Chart not found");
    }

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
