import { redirect } from "next/navigation";
import { getMostRecentChartForWorkspace, createLensChartPair, getConfigForChart } from "@/lib/queries/chartQueries";
import { LensConfigData } from "@/types/lens";

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

    // If no chart exists, create a new lens chart pair with default config
    if (!chart) {
        const defaultConfig: LensConfigData = {
            prompt: initialPrompt,
            model: initialModel,
            token: { idx: 0, id: 0, text: "", targetIds: [] },
        };

        const result = await createLensChartPair(workspaceId, defaultConfig);
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
