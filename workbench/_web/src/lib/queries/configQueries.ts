"use server";

import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { configs, NewConfig, Config, chartConfigLinks } from "@/db/schema";
import { normalizeToolType } from "@/types/charts";

export const setConfig = async (configId: string, config: NewConfig): Promise<void> => {
    await db
        .update(configs)
        .set({ ...config, type: normalizeToolType(config.type) })
        .where(eq(configs.id, configId));
};

export const deleteConfig = async (configId: string): Promise<void> => {
    await db.delete(configs).where(eq(configs.id, configId));
};

export const getConfigs = async (chartId: string): Promise<Config[]> => {
    const configsData = await db
        .select()
        .from(configs)
        .innerJoin(chartConfigLinks, eq(configs.id, chartConfigLinks.configId))
        .where(eq(chartConfigLinks.chartId, chartId));
    return configsData.map(
        (data: { configs: Config }) =>
            ({ ...data.configs, type: normalizeToolType(data.configs.type) }) as Config,
    );
};
