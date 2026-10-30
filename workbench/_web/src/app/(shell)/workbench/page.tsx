import { redirect } from "next/navigation";
import { redirectWorkshopParticipant, requireUser } from "@/lib/auth/user";
import { chartLaunchFromSearchParams } from "@/lib/chartLaunch";
import { newChartPath } from "@/lib/chartRoutes";
import { LandingComposer } from "@/components/LandingComposer";
import { PageHeader } from "../components/shell/PageHeader";

export const dynamic = "force-dynamic";

/**
 * Home, and the post-login entry: the landing page's composer, which starts a
 * chart from a prompt, a tool and a model, on the landing page's background.
 * Chart-creation params (old `/workbench?tool=…&prompt=…` links) go on to
 * `/new`. A workshop participant goes to their workshop instead.
 */
export default async function WorkbenchPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const user = await requireUser();
    await redirectWorkshopParticipant(user);

    const params = await searchParams;
    if (params.models === "open") redirect("/models");

    const launch = chartLaunchFromSearchParams(params);
    if (Object.keys(launch).length > 0 || params.createNew !== undefined) {
        redirect(newChartPath(launch));
    }

    return (
        <div className="aurora-bg flex size-full min-h-0 flex-col">
            <PageHeader />
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-3 md:px-6">
                <LandingComposer loggedIn />
            </div>
        </div>
    );
}
