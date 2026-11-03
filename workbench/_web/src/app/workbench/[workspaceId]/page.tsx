import { notFound, redirect } from "next/navigation";
import { redirectWorkshopParticipant, requireUser } from "@/lib/auth/user";
import {
    createLogitLensChartPair,
    getMostRecentChartForWorkspace,
    seedWorkshopChart,
} from "@/lib/queries/chartDb";
import { getWorkshopForWorkspace } from "@/lib/queries/workshopDb";
import { getWorkspaceById } from "@/lib/queries/workspaceDb";
import { toolChartPath } from "@/lib/chartRoutes";
import { LogitLensConfigData } from "@/types/logitLens";

/**
 * Opens one of the user's workspaces on its most recent live chart, creating
 * one when it has none. Another user's (or a missing) workspace is a 404, and
 * a workshop participant can only open a workshop workspace.
 */
export default async function Page({
    params,
    searchParams,
}: {
    params: Promise<{ workspaceId: string }>;
    searchParams: Promise<{ prompt?: string; model?: string }>;
}) {
    const { workspaceId } = await params;
    const [user, workspace] = await Promise.all([requireUser(), getWorkspaceById(workspaceId)]);
    if (!workspace || workspace.userId !== user.id) notFound();
    if (!workspace.workshopId) await redirectWorkshopParticipant(user);

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
                includeEntropy: false,
            };

            const { chart } = await createLogitLensChartPair(workspaceId, defaultConfig);
            recent = { chart, toolType: "logit-lens" };
        }
    }

    redirect(toolChartPath(recent.chart.id, recent.toolType));
}
