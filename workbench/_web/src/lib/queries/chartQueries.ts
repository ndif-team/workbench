"use server";

import type { ChartData, ToolTypedChart, BasicChart, BasicChartWithTool } from "@/types/charts";
import { db } from "@/db/client";
import { charts, configs, chartConfigLinks, NewChart, Chart, LensConfig, Config, annotations, chartThumbnails } from "@/db/schema";
import { LensConfigData } from "@/types/lens";
import { PatchingConfig } from "@/types/patching";
import { eq, and, asc, notExists, or, desc, sql } from "drizzle-orm";

export const setChartData = async (chartId: string, chartData: ChartData, chartType: "line" | "heatmap") => {
    await db.update(charts).set({ data: chartData, type: chartType }).where(eq(charts.id, chartId));
};

export const updateChartName = async (chartId: string, name: string) => {
    await db.update(charts).set({ name }).where(eq(charts.id, chartId));
};

export const getChartData = async (chartId: string): Promise<ChartData> => {
    const [chart] = await db.select().from(charts).where(eq(charts.id, chartId));
    return chart?.data as ChartData;
};

// Fetch a single chart by id including its type and data
export const getChartById = async (chartId: string): Promise<Chart | null> => {
    const [chart] = await db.select().from(charts).where(eq(charts.id, chartId));
    return (chart ?? null) as Chart | null;
};

export const getLensCharts = async (workspaceId: string): Promise<Chart[]> => {
    const chartsData = await db
        .select()
        .from(charts)
        .innerJoin(chartConfigLinks, eq(charts.id, chartConfigLinks.chartId))
        .innerJoin(configs, eq(chartConfigLinks.configId, configs.id))
        .where(and(eq(charts.workspaceId, workspaceId), eq(configs.type, "lens")));

    return chartsData.map(({ charts }) => charts);
};

export const getLensConfigs = async (workspaceId: string): Promise<LensConfig[]> => {
    const configsData = await db
        .select()
        .from(configs)
        .where(and(eq(configs.workspaceId, workspaceId), eq(configs.type, "lens")))
        .orderBy(asc(configs.createdAt));

    return configsData as LensConfig[];
};

export const createChart = async (chart: NewChart): Promise<Chart> => {
    const [createdChart] = await db.insert(charts).values(chart).returning();
    return createdChart;
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

// Create a new chart and config at once. Used in the ChartDisplay.
export const createLensChartPair = async (
    workspaceId: string,
    defaultConfig: LensConfigData
): Promise<{ chart: Chart; config: LensConfig }> => {
    const [newChart] = await db.insert(charts).values({ workspaceId }).returning();
    const [newConfig] = await db
        .insert(configs)
        .values({ workspaceId, type: "lens", data: defaultConfig })
        .returning();
    
    // Create the link between chart and config
    await db.insert(chartConfigLinks).values({
        chartId: newChart.id,
        configId: newConfig.id,
    });
    
    return { chart: newChart as Chart, config: newConfig as LensConfig };
};

// Create a new patch chart and config pair
export const createPatchChartPair = async (
    workspaceId: string,
    defaultConfig: PatchingConfig
): Promise<{ chart: Chart; config: Config }> => {
    const [newChart] = await db.insert(charts).values({ workspaceId }).returning();
    const [newConfig] = await db
        .insert(configs)
        .values({ workspaceId, type: "patch", data: defaultConfig })
        .returning();
    
    // Create the link between chart and config
    await db.insert(chartConfigLinks).values({
        chartId: newChart.id,
        configId: newConfig.id,
    });
    
    return { chart: newChart as Chart, config: newConfig as Config };
};

export const getAllChartsByType = async (workspaceId?: string): Promise<Record<string, Chart[]>> => {
    // Join charts with their configs to get the config type
    const query = db
        .select({
            chart: charts,
            configType: configs.type,
        })
        .from(charts)
        .leftJoin(chartConfigLinks, eq(charts.id, chartConfigLinks.chartId))
        .leftJoin(configs, eq(chartConfigLinks.configId, configs.id));
    
    const chartsWithConfigs = workspaceId 
        ? await query.where(eq(charts.workspaceId, workspaceId))
        : await query;

    // Group charts by their config type
    const chartsByType: Record<string, Chart[]> = {};
    
    for (const { chart, configType } of chartsWithConfigs) {
        const type = configType || 'unknown';
        if (!chartsByType[type]) {
            chartsByType[type] = [];
        }
        chartsByType[type].push(chart);
    }
    
    return chartsByType;
};

// Save or update a chart thumbnail url
export const upsertChartThumbnail = async (chartId: string, url: string) => {
    const existing = await db.select().from(chartThumbnails).where(eq(chartThumbnails.chartId, chartId)).limit(1);
    if (existing.length > 0) {
        await db.update(chartThumbnails).set({ url }).where(eq(chartThumbnails.chartId, chartId));
        return { chartId, url };
    }
    const [created] = await db.insert(chartThumbnails).values({ chartId, url }).returning();
    return created;
};

export const getChartThumbnail = async (chartId: string): Promise<string | null> => {
    const rows = await db.select().from(chartThumbnails).where(eq(chartThumbnails.chartId, chartId)).limit(1);
    return rows.length > 0 ? (rows[0].url as string) : null;
};

// Minimal chart info for sidebar cards with config type and annotation count
export const getChartsForSidebar = async (workspaceId: string): Promise<ToolTypedChart[]> => {
    const rows = await db
        .select({
            id: charts.id,
            chartType: charts.type,
            createdAt: charts.createdAt,
            toolType: configs.type,
            annotationCount: sql<number>`count(${annotations.id})`,
            thumbnailUrl: chartThumbnails.url,
        })
        .from(charts)
        .leftJoin(chartConfigLinks, eq(charts.id, chartConfigLinks.chartId))
        .leftJoin(configs, eq(chartConfigLinks.configId, configs.id))
        .leftJoin(annotations, eq(annotations.chartId, charts.id))
        .leftJoin(chartThumbnails, eq(chartThumbnails.chartId, charts.id))
        .where(eq(charts.workspaceId, workspaceId))
        .groupBy(charts.id, charts.createdAt, charts.type, configs.type, chartThumbnails.url)
        .orderBy(desc(charts.createdAt));

    return rows.map((r) => ({
        id: r.id,
        chartType: (r.chartType as "line" | "heatmap" | null) ?? null,
        toolType: (r.toolType as "lens" | "patch" | null) ?? null,
        createdAt: r.createdAt as Date,
        annotationCount: Number(r.annotationCount ?? 0),
        thumbnailUrl: (r.thumbnailUrl ?? null) as string | null,
    } as ToolTypedChart));
};

export const getChartsBasic = async (workspaceId: string): Promise<BasicChart[]> => {
    const rows = await db
        .select({
            id: charts.id,
            name: charts.name,
            type: charts.type,
        })
        .from(charts)
        .where(eq(charts.workspaceId, workspaceId));

    return rows.map((r) => ({ id: r.id, name: (r.name ?? null) as string | null, type: (r.type as "line" | "heatmap" | null) }));
};

export const getChartsBasicWithToolType = async (workspaceId: string): Promise<BasicChartWithTool[]> => {
    const rows = await db
        .select({
            id: charts.id,
            name: charts.name,
            chartType: charts.type,
            toolType: configs.type,
        })
        .from(charts)
        .leftJoin(chartConfigLinks, eq(charts.id, chartConfigLinks.chartId))
        .leftJoin(configs, eq(chartConfigLinks.configId, configs.id))
        .where(eq(charts.workspaceId, workspaceId))
        .orderBy(desc(charts.createdAt));

    // If a chart is linked to multiple configs, prefer the most recent join row as ordered above
    const seen = new Set<string>();
    const results: BasicChartWithTool[] = [];
    for (const r of rows) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        results.push({
            id: r.id,
            name: (r.name ?? null) as string | null,
            chartType: (r.chartType as "line" | "heatmap" | null) ?? null,
            toolType: (r.toolType as "lens" | "patch" | null) ?? null,
        });
    }
    return results;
};
