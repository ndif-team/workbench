"use server";

import { LensConfigData } from "@/types/lens";
import { createLensChartPair, setChartData, updateChartName } from "./chartQueries";
import { createDocument, updateDocument } from "./documentQueries";
import { promises as fs } from "fs";
import path from "path";
import { SerializedEditorState } from "lexical";
import translation_config from "@/lib/data/tutorial/translation_config.json";
import translation_data from "@/lib/data/tutorial/translation_data.json";
import knowledge_config from "@/lib/data/tutorial/knowledge_config.json";
import knowledge_data from "@/lib/data/tutorial/knowledge_data.json";
import report_template from "@/lib/data/tutorial/report.json";

const getSampleConfig = async (filename: string): Promise<LensConfigData> => {
    // Use absolute path for Vercel deployment
    const filePath = path.join(process.cwd(), "src", "lib", "data", "tutorial", filename);
    const file = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(file);
    return data;
};

const getSampleData = async (filename: string) => {
    // Use absolute path for Vercel deployment
    const filePath = path.join(process.cwd(), "src", "lib", "data", "tutorial", filename);
    const file = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(file);
    return data;
};

const getReportTemplate = async (): Promise<SerializedEditorState> => {
    // Use absolute path for Vercel deployment
    const filePath = path.join(process.cwd(), "src", "lib", "data", "tutorial", "report.json");
    const file = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(file);
    return data as SerializedEditorState;
};

// Replace placeholder chart IDs in the report with actual chart IDs
const replaceChartIds = (
    content: SerializedEditorState,
    chartIdMap: Record<string, string>,
): SerializedEditorState => {
    const contentStr = JSON.stringify(content);
    let updatedStr = contentStr;

    // Replace each placeholder with actual chart ID
    for (const [placeholder, actualId] of Object.entries(chartIdMap)) {
        updatedStr = updatedStr.replace(new RegExp(placeholder, "g"), actualId);
    }

    return JSON.parse(updatedStr);
};

export async function pushTutorialChart(workspaceId: string) {
    const createdCharts = [];

    // Tutorial chart 1 - Translation (Heatmap)
    // const translationConfig: LensConfigData = await getSampleConfig("translation_config.json");
    const translationConfig: LensConfigData = JSON.parse(JSON.stringify(translation_config));
    const { chart: chart1 } = await createLensChartPair(workspaceId, translationConfig);
    const translationData = JSON.parse(JSON.stringify(translation_data));
    await setChartData(chart1.id, translationData, "heatmap");
    await updateChartName(chart1.id, "Example: Translation");
    createdCharts.push({ ...chart1, name: "Example: Translation" });

    // Tutorial chart 2 - Knowledge (Line)
    const knowledgeConfig: LensConfigData = JSON.parse(JSON.stringify(knowledge_config));
    const { chart: chart2 } = await createLensChartPair(workspaceId, knowledgeConfig);
    const knowledgeData = JSON.parse(JSON.stringify(knowledge_data));
    await setChartData(chart2.id, knowledgeData, "line");
    await updateChartName(chart2.id, "Example: Knowledge");
    createdCharts.push({ ...chart2, name: "Example: Knowledge" });

    // Create default report with embedded charts
    // const reportTemplate = await getReportTemplate();
    const reportTemplate = JSON.parse(JSON.stringify(report_template));

    // Map placeholder IDs to actual chart IDs
    const chartIdMap = {
        "8af02dc3-afe9-42aa-9096-249270721891": chart1.id, // Translation heatmap
        "609d061c-2260-417b-a2a6-36cc035e450b": chart2.id, // Knowledge line
    };

    const updatedReport = replaceChartIds(reportTemplate, chartIdMap);

    // Create the document
    const document = await createDocument(workspaceId);
    await updateDocument(document.id, updatedReport);

    return { charts: createdCharts, document };
}
