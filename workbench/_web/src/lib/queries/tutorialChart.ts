"use server";

import { LensConfigData } from "@/types/lens";
import { createLensChartPair, setChartData, updateChartName } from "./chartQueries";
import { promises as fs } from "fs";

const getSampleConfig = async (filename: string): Promise<LensConfigData> => {
    const file = await fs.readFile(`src/lib/data/tutorial/${filename}`, "utf-8");
    const data = JSON.parse(file);
    return data;
};

const getSampleData = async (filename: string) => {
    const file = await fs.readFile(`src/lib/data/tutorial/${filename}`, "utf-8");
    const data = JSON.parse(file);
    return data;
};


export async function pushTutorialChart(
    workspaceId: string,
) {

    const createdCharts = [];

    // Tutorial chart 1
    const translationConfig: LensConfigData = await getSampleConfig("translation_config.json");
    const { chart: chart1 } = await createLensChartPair(workspaceId, translationConfig);
    const translationData = await getSampleData("translation_data.json");
    await setChartData(chart1.id, translationData, "heatmap");
    await updateChartName(chart1.id, "Example: Translation");
    createdCharts.push({ ...chart1, name: "Example: Translation" });

    // Tutorial chart 2
    const knowledgeConfig: LensConfigData = await getSampleConfig("knowledge_config.json");
    const { chart: chart2 } = await createLensChartPair(workspaceId, knowledgeConfig);
    const knowledgeData = await getSampleData("knowledge_data.json");
    await setChartData(chart2.id, knowledgeData, "line");
    await updateChartName(chart2.id, "Example: Knowledge");
    createdCharts.push({ ...chart2, name: "Example: Knowledge" });

    return createdCharts;
}
