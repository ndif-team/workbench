"use server";

import { db } from "@/db/client";
import { and, eq } from "drizzle-orm";
import { views, charts, type View, type NewView } from "@/db/schema";
import type { ChartType, ChartView } from "@/types/charts";
import { requireUserId, requireChartOwner, ownedByChart } from "@/lib/auth/ownership";

export const getView = async (
    chartId: string,
): Promise<{ view: View; chartType: ChartType } | null> => {
    const userId = await requireUserId();
    const result = await db
        .select({
            id: views.id,
            chartId: views.chartId,
            data: views.data,
            chartType: charts.type,
        })
        .from(views)
        .leftJoin(charts, eq(views.chartId, charts.id))
        .where(and(eq(views.chartId, chartId), ownedByChart(views.chartId, userId)));

    if (!result[0]) return null;
    return { view: result[0], chartType: result[0].chartType as ChartType };
};

export const createView = async (newView: NewView): Promise<View> => {
    // INSERT: a view hangs off a chart, so the caller must own that chart.
    await requireChartOwner(newView.chartId);
    const [view] = await db.insert(views).values(newView).returning();
    return view;
};

export const deleteView = async (id: string): Promise<void> => {
    const userId = await requireUserId();
    await db.delete(views).where(and(eq(views.id, id), ownedByChart(views.chartId, userId)));
};

export const updateView = async (id: string, data: ChartView): Promise<View | undefined> => {
    const userId = await requireUserId();
    const [updated] = await db
        .update(views)
        .set({ data })
        .where(and(eq(views.id, id), ownedByChart(views.chartId, userId)))
        .returning();
    // Unlike the other guarded writes, a zero-row result here is not treated as a
    // forbidden error: the ownedByChart predicate already blocks any cross-user
    // write (nothing matched, nothing leaked). It also fires benignly during the
    // debounced autosave race — ViewProvider's clear/reset can deleteView between
    // the getView read and the 1.5s-debounced updateView, leaving a stale view id
    // that matches nothing. Returning undefined lets the provider self-heal
    // (deleteView invalidates getView → next autosave createView) instead of
    // surfacing a spurious "Error updating view" toast to the owner.
    return updated;
};
