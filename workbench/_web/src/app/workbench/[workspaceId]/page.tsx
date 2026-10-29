import { redirect } from "next/navigation";
import {
    getMostRecentChartForWorkspace,
    createLogitLensChartPair,
} from "@/lib/queries/chartQueries";
import { getWorkshopForWorkspace, seedWorkshopChart } from "@/lib/queries/workshopQueries";
import { toolChartPath } from "@/lib/chartRoutes";
import { LogitLensConfigData } from "@/types/logitLens";

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

    // Open the most recent chart of a live tool
    let recent = await getMostRecentChartForWorkspace(workspaceId);

    // If there is none, create a new Logit Lens chart pair with default
    // config — except in workshop workspaces, which seed their workshop's
    // first allowed tool with its pinned model and starter prompt.
    if (!recent) {
        const workshop = await getWorkshopForWorkspace(workspaceId);
        if (workshop) {
            const { chart, tool } = await seedWorkshopChart(workspaceId, workshop);
            recent = { chart, toolType: tool };
        } else {
            const defaultConfig: LogitLensConfigData = {
                prompt: initialPrompt,
                model: initialModel,
                topk: 5,
                includeEntropy: true,
            };

            const { chart } = await createLogitLensChartPair(workspaceId, defaultConfig);
            recent = { chart, toolType: "logit-lens" };
        }
    }

    redirect(toolChartPath(workspaceId, recent.chart.id, recent.toolType));
}
