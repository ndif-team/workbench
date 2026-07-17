"use server";

import { db } from "@/db/client";
import { and, eq } from "drizzle-orm";
import { configs, NewConfig, Config, chartConfigLinks } from "@/db/schema";
import {
    requireUserId,
    requireWorkspaceOwner,
    requireChartOwner,
    ownedByWorkspace,
} from "@/lib/auth/ownership";

export const setConfig = async (configId: string, config: NewConfig): Promise<void> => {
    const userId = await requireUserId();
    // Only the payload/type are mutable. Never spread the whole `config`: that
    // would let a client rewrite `workspaceId` (a with-check bypass) and relocate
    // an owned config into another workspace, silently detaching it from its chart.
    await db
        .update(configs)
        .set({ data: config.data, type: config.type })
        .where(and(eq(configs.id, configId), ownedByWorkspace(configs.workspaceId, userId)));
};

export const addConfig = async (config: NewConfig): Promise<void> => {
    // INSERT: confirm the target workspace is owned before writing the config.
    await requireWorkspaceOwner(config.workspaceId);
    await db.insert(configs).values(config);
};

export const deleteConfig = async (configId: string): Promise<void> => {
    const userId = await requireUserId();
    await db
        .delete(configs)
        .where(and(eq(configs.id, configId), ownedByWorkspace(configs.workspaceId, userId)));
};

export const addChartConfigLink = async (configId: string, chartId: string): Promise<void> => {
    // INSERT: linking a config to a chart — the caller must own the chart.
    await requireChartOwner(chartId);
    await db.insert(chartConfigLinks).values({ configId, chartId });
};

export const getConfigs = async (chartId: string): Promise<Config[]> => {
    const userId = await requireUserId();
    const configsData = await db
        .select()
        .from(configs)
        .innerJoin(chartConfigLinks, eq(configs.id, chartConfigLinks.configId))
        .where(
            and(eq(chartConfigLinks.chartId, chartId), ownedByWorkspace(configs.workspaceId, userId)),
        );
    // Explicit element type: the correlated EXISTS in the WHERE tips drizzle's
    // dual-schema inference into widening the joined row to `any` (same quirk as
    // getChartsMetadata). The projection is unchanged, so the cast is safe.
    return (configsData as { configs: Config }[]).map((data) => data.configs);
};
