"use server";

import { upsertChartThumbnail } from "@/lib/queries/chartQueries";

export async function saveChartThumbnailUrl(chartId: string, url: string) {
  await upsertChartThumbnail(chartId, url);
}