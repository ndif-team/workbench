"use server";

import { ChartData } from "@/types/charts";
import { db } from "@/db/client";
import { charts, configs, chartConfigLinks, NewChart, Chart, LensConfig, Config, annotations } from "@/db/schema";
import { LensConfigData } from "@/types/lens";
import { PatchingConfig } from "@/types/patching";
import { eq, and, asc, desc, sql } from "drizzle-orm";

export const setChartData = async (chartId: string, chartData: ChartData, chartType: "line" | "heatmap") => {
    await db.update(charts).set({ data: chartData, type: chartType, updatedAt: new Date() }).where(eq(charts.id, chartId));
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

export const getLensConfigs = async (workspaceId: string) => {
    const configsData = await db
        .select()
        .from(configs)
        .where(and(eq(configs.workspaceId, workspaceId), eq(configs.type, "lens")))
        .orderBy(asc(configs.createdAt));

    return configsData as any;
};

export const createChart = async (chart: NewChart): Promise<Chart> => {
    const [createdChart] = await db.insert(charts).values(chart).returning();
    return createdChart;
};

export const deleteChart = async (chartId: string): Promise<void> => {
    await db.delete(charts).where(eq(charts.id, chartId));
};

export const getConfigForChart = async (chartId: string): Promise<any | null> => {
    const rows = await db
        .select()
        .from(configs)
        .innerJoin(chartConfigLinks, eq(configs.id, chartConfigLinks.configId))
        .where(eq(chartConfigLinks.chartId, chartId))
        .limit(1);
    if (rows.length === 0) return null;
    return rows[0].configs as any;
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

// Minimal chart info for sidebar cards with config type and annotation count
export type ToolTypedChart = {
    id: string;
    name: string;
    chartType: "line" | "heatmap" | null;
    toolType: "lens" | "patch" | null;
    createdAt: Date;
    updatedAt: Date;
    annotationCount: number;
};

export const getChartsForSidebar = async (workspaceId: string): Promise<ToolTypedChart[]> => {
    const rows = await db
        .select({
            id: charts.id,
            name: charts.name,
            chartType: charts.type,
            createdAt: charts.createdAt,
            updatedAt: charts.updatedAt,
            toolType: configs.type,
            annotationCount: sql<number>`count(${annotations.id})`,
        })
        .from(charts)
        .leftJoin(chartConfigLinks, eq(charts.id, chartConfigLinks.chartId))
        .leftJoin(configs, eq(chartConfigLinks.configId, configs.id))
        .leftJoin(annotations, eq(annotations.chartId, charts.id))
        .where(eq(charts.workspaceId, workspaceId))
        .groupBy(charts.id, charts.createdAt, charts.updatedAt, charts.type, charts.name, configs.type)
        .orderBy(desc(charts.updatedAt), desc(charts.createdAt));

    return rows.map((r) => ({
        id: r.id,
        name: r.name as string,
        chartType: (r.chartType as "line" | "heatmap" | null) ?? null,
        toolType: (r.toolType as "lens" | "patch" | null) ?? null,
        createdAt: r.createdAt as Date,
        updatedAt: r.updatedAt as Date,
        annotationCount: Number(r.annotationCount ?? 0),
    }));
};
