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

    // Check if this is a lens2 chart by looking at its config type
    const config = await getConfigForChart(chart.id);
    const isLens2 = config?.type === "lens2" || chart.type === "lens2";

    // Redirect to the appropriate chart route
    if (isLens2) {
        redirect(`/workbench/${workspaceId}/lens2/${chart.id}`);
    } else {
        redirect(`/workbench/${workspaceId}/${chart.id}`);
    }
}
