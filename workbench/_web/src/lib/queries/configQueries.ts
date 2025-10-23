"use server";

import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { configs, NewConfig, Config, chartConfigLinks } from "@/db/schema";

export const setConfig = async (configId: string, config: NewConfig): Promise<void> => {
    await db.update(configs).set(config).where(eq(configs.id, configId));
};

export const addConfig = async (config: NewConfig): Promise<void> => {
    await db.insert(configs).values(config);
};

export const deleteConfig = async (configId: string): Promise<void> => {
    await db.delete(configs).where(eq(configs.id, configId));
};

export const addChartConfigLink = async (configId: string, chartId: string): Promise<void> => {
    await db.insert(chartConfigLinks).values({ configId, chartId });
};

export const getConfigs = async (chartId: string): Promise<Config[]> => {
    const configsData = await db
        .select()
        .from(configs)
        .innerJoin(chartConfigLinks, eq(configs.id, chartConfigLinks.configId))
        .where(eq(chartConfigLinks.chartId, chartId));
    return configsData.map((data) => data.configs);
};
