import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { chartConfigLinks, charts, configs, workspaces, type NewConfig } from "@/db/schema";
import { normalizeToolType } from "@/types/charts";

/**
 * Unguarded config DB internals. The "use server" RPC surface lives in
 * configQueries.ts, which resolves the signed-in user before calling these.
 * A config belongs to the chart that links it, so each takes the user and
 * touches only configs of charts in that user's workspaces.
 */

/** The config `configId`, as a filter that matches only when it is linked to one of the user's charts. */
const isUserConfig = (userId: string, configId: string) =>
    and(
        eq(configs.id, configId),
        inArray(
            configs.id,
            db
                .select({ id: chartConfigLinks.configId })
                .from(chartConfigLinks)
                .innerJoin(charts, eq(chartConfigLinks.chartId, charts.id))
                .innerJoin(workspaces, eq(charts.workspaceId, workspaces.id))
                .where(eq(workspaces.userId, userId)),
        ),
    );

/**
 * Saves the payload and type of the config of one of the user's charts. Its
 * workspace isn't written: it follows the chart (`moveChart` moves it), so a
 * `workspaceId` sent from a page whose scope predates a move is ignored.
 */
export const setConfig = async (
    userId: string,
    configId: string,
    config: NewConfig,
): Promise<void> => {
    const updated = await db
        .update(configs)
        .set({ data: config.data, type: normalizeToolType(config.type) })
        .where(isUserConfig(userId, configId))
        .returning({ id: configs.id });
    if (updated.length === 0) throw new Error("Config not found or access denied");
};
