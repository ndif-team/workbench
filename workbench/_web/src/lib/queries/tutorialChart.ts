"use server";

import { LensConfigData, Metrics } from "@/types/lens";
import { HeatmapRow, Line } from "@/types/charts";
import { createLensChartPair, setChartData } from "./chartQueries";
import { promises as fs } from "fs";

const getSampleConfig = async (): Promise<LensConfigData> => {
    const file = await fs.readFile("src/lib/queries/tutorial_config.json", "utf-8");
    const data = JSON.parse(file);
    return data;
};

const getSampleData = async () => {
    const file = await fs.readFile("src/lib/queries/tutorial_data.json", "utf-8");
    const data = JSON.parse(file);
    return data;
};


export async function pushTutorialChart(
    workspaceId: string,
) {

    const createdCharts = [];

    const heatmapConfig: LensConfigData = await getSampleConfig();

    const { chart } = await createLensChartPair(workspaceId, heatmapConfig);
    
    const heatmapData = await getSampleData();
    
    await setChartData(chart.id, heatmapData, "heatmap");
    
    createdCharts.push({ ...chart, name: "Example" });

    return createdCharts;
}
