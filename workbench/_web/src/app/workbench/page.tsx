import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth/user";
import { chartLaunchFromSearchParams } from "@/lib/chartLaunch";
import { newChartPath, toolChartPath } from "@/lib/chartRoutes";
import { getMostRecentUserChart } from "@/lib/queries/workspaceDb";

export const dynamic = "force-dynamic";

/**
 * Post-login entry. Chart-creation params (old `/workbench?tool=…&prompt=…`
 * links) go on to `/new`; otherwise it opens the user's most recently updated
 * chart outside workshops, or a new Logit Lens chart when they have none.
 */
export default async function WorkbenchPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    if (params.models === "open") redirect("/models");

    const launch = chartLaunchFromSearchParams(params);
    if (Object.keys(launch).length > 0 || params.createNew !== undefined) {
        redirect(newChartPath(launch));
    }

    const recent = await getMostRecentUserChart(await requireUserId());
    redirect(
        recent
            ? toolChartPath(recent.chartId, recent.toolType)
            : newChartPath({ tool: "Logit Lens" }),
    );
}
