"use server";

import type { Chart, Config } from "@/db/schema";
import { db } from "@/db/client";
import { charts, configs, chartConfigLinks } from "@/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { requireUserId } from "@/lib/auth/user";
import type { ChartLaunchRequest } from "@/lib/chartLaunch";
import * as chartDb from "@/lib/queries/chartDb";
import { normalizeToolType } from "@/types/charts";
import type { ChartData, ChartMetadata, ChartType, ToolType } from "@/types/charts";
import type { ActivationPatchingConfigData } from "@/types/activationPatching";
import type { JLensConfigData } from "@/types/jlens";
import type { LogitLensConfigData } from "@/types/logitLens";

/**
 * The chart RPC surface. Every export is a public endpoint: writes resolve
 * the signed-in user and act only on charts in their workspaces (the
 * unguarded internals live in chartDb.ts). The reads below are keyed by a
 * chart or workspace id and not owner-checked.
 */

export const getChartById = async (chartId: string): Promise<Chart | null> => {
    const [chart] = await db.select().from(charts).where(eq(charts.id, chartId));
    return chart ? chartDb.withCurrentToolType(chart as Chart) : null;
};

export const getConfigForChart = async (chartId: string): Promise<Config | null> => {
    const rows = await db
        .select()
        .from(configs)
        .innerJoin(chartConfigLinks, eq(configs.id, chartConfigLinks.configId))
        .where(eq(chartConfigLinks.chartId, chartId))
        .limit(1);
    if (rows.length === 0) return null;
    return chartDb.withCurrentToolType(rows[0].configs as Config);
};

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
                chartType: normalizeToolType(r.chartType ?? null),
                toolType: normalizeToolType(r.toolType ?? null),
                position: r.position,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
                model: r.configData?.model ?? null,
                hasData: !!r.hasData,
            }) as ChartMetadata,
    );
};

/** Saves a run's result on one of the signed-in user's charts. */
export async function setChartData(
    chartId: string,
    chartData: ChartData,
    chartType: ChartType,
): Promise<void> {
    return chartDb.setChartData(await requireUserId(), chartId, chartData, chartType);
}

/** Renames one of the signed-in user's charts. */
export async function updateChartName(chartId: string, name: string): Promise<void> {
    return chartDb.renameChart(await requireUserId(), chartId, name);
}

/** Deletes one of the signed-in user's charts. */
export async function deleteChart(chartId: string): Promise<void> {
    return chartDb.deleteChart(await requireUserId(), chartId);
}

/** Copies one of the signed-in user's charts, with its config, into the same workspace. */
export async function copyChart(chartId: string): Promise<Chart> {
    return chartDb.copyChart(await requireUserId(), chartId);
}

/** The signed-in user's workspace `workspaceId`, checked as a place for a new chart. */
async function newChartWorkspace(workspaceId: string): Promise<string> {
    return chartDb.assertChartWorkspace(await requireUserId(), workspaceId);
}

export async function createLogitLensChartPair(
    workspaceId: string,
    defaultConfig: LogitLensConfigData,
) {
    return chartDb.createLogitLensChartPair(await newChartWorkspace(workspaceId), defaultConfig);
}

export async function createJLensChartPair(workspaceId: string, defaultConfig: JLensConfigData) {
    return chartDb.createJLensChartPair(await newChartWorkspace(workspaceId), defaultConfig);
}

export async function createPatchLensChartPair(workspaceId: string) {
    return chartDb.createPatchLensChartPair(await newChartWorkspace(workspaceId));
}

export async function createActivationPatchingChartPair(
    workspaceId: string,
    defaultConfig: ActivationPatchingConfigData,
) {
    return chartDb.createActivationPatchingChartPair(
        await newChartWorkspace(workspaceId),
        defaultConfig,
    );
}

/**
 * Creates the chart a `/new` launch asks for, in the signed-in user's default
 * workspace or in `request.workspaceId` when it is one of theirs, and returns
 * where to open it.
 */
export async function createChartFromLaunch(
    request: ChartLaunchRequest,
): Promise<{ chartId: string; toolType: ToolType; workspaceId: string }> {
    return chartDb.createChartFromLaunch(await requireUserId(), request);
}
