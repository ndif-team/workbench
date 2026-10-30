import { redirect } from "next/navigation";
import { chartLaunchFromSearchParams } from "@/lib/chartLaunch";
import { newChartPath } from "@/lib/chartRoutes";

/**
 * The old Home and post-login URL, kept for bookmarks and old links: it opens
 * Home at `/`. Chart-creation params (old `/workbench?tool=…&prompt=…` links)
 * go on to `/new`, and `?models=open` to the models page.
 */
export default async function WorkbenchRedirect({
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
    redirect("/");
}
