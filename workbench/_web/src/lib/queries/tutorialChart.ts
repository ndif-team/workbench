"use server";

import { LensConfigData } from "@/types/lens";
import { createLensChartPair, setChartData, updateChartName } from "./chartQueries";
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
    
    // Update the chart name in the database
    await updateChartName(chart.id, "Example");
    
    createdCharts.push({ ...chart, name: "Example" });

    return createdCharts;
}
