"use server";

import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { views, charts, type View, type NewView } from "@/db/schema";
import type { ChartType, ChartView } from "@/types/charts";

export const getView = async (
    chartId: string,
): Promise<{ view: View; chartType: ChartType } | null> => {
    const result = await db
        .select({
            id: views.id,
            chartId: views.chartId,
            data: views.data,
            chartType: charts.type,
        })
        .from(views)
        .leftJoin(charts, eq(views.chartId, charts.id))
        .where(eq(views.chartId, chartId));

    if (!result[0]) return null;
    return { view: result[0], chartType: result[0].chartType as ChartType };
};

export const createView = async (newView: NewView): Promise<View> => {
    const [view] = await db.insert(views).values(newView).returning();
    return view;
};

export const deleteView = async (id: string): Promise<void> => {
    await db.delete(views).where(eq(views.id, id));
};

export const updateView = async (id: string, data: ChartView): Promise<View> => {
    const [updated] = await db.update(views).set({ data }).where(eq(views.id, id)).returning();
    return updated;
};
