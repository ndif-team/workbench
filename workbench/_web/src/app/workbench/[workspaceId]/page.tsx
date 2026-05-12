import { redirect } from "next/navigation";
import { getMostRecentChartForWorkspace, createLens2ChartPair, getConfigForChart } from "@/lib/queries/chartQueries";
import { Lens2ConfigData } from "@/types/lens2";

export default async function Page({
    params,
    searchParams,
}: {
    params: Promise<{ workspaceId: string }>;
    searchParams: Promise<{ prompt?: string; model?: string }>;
}) {
    const { workspaceId } = await params;
    const urlParams = await searchParams;
    const initialPrompt = urlParams?.prompt || "";
    const initialModel = urlParams?.model || "";

    // Check if there's an existing chart
    let chart = await getMostRecentChartForWorkspace(workspaceId);

    // If no chart exists, create a new Logit Lens chart pair with default config
    if (!chart) {
        const defaultConfig: Lens2ConfigData = {
            prompt: initialPrompt,
            model: initialModel,
            topk: 5,
            includeEntropy: true,
        };

        const result = await createLens2ChartPair(workspaceId, defaultConfig);
        chart = result.chart;
    }

    // Check the chart/config type to determine the route
    const config = await getConfigForChart(chart.id);
    const chartType = config?.type || chart.type;

    // Redirect to the appropriate chart route based on type
    if (chartType === "lens2") {
        redirect(`/workbench/${workspaceId}/lens2/${chart.id}`);
    } else if (chartType === "activation-patching") {
        redirect(`/workbench/${workspaceId}/activation-patching/${chart.id}`);
    } else {
        redirect(`/workbench/${workspaceId}/${chart.id}`);
    }
}
