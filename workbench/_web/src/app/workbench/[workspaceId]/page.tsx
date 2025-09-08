import { redirect } from "next/navigation";
import { getMostRecentChartForWorkspace, createLensChartPair } from "@/lib/queries/chartQueries";
import { LensConfigData } from "@/types/lens";

export default async function Page({ params }: { params: { workspaceId: string } }) {
    const { workspaceId } = params;

    // Check if there's an existing chart
    let chart = await getMostRecentChartForWorkspace(workspaceId);

    // If no chart exists, create a new lens chart pair with default config
    if (!chart) {
        const defaultConfig: LensConfigData = {
            prompt: "",
            model: "",
            token: { idx: 0, id: 0, text: "", targetIds: [] },
        };

        const result = await createLensChartPair(workspaceId, defaultConfig);
        chart = result.chart;
    }

    // Redirect to the chart
    redirect(`/workbench/${workspaceId}/${chart.id}`);
}
