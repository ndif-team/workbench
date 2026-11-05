import { getSessionUser, redirectWorkshopParticipant } from "@/lib/auth/user";
import { chartLaunchFromSearchParams } from "@/lib/chartLaunch";
import { NewChartCreator } from "./components/NewChartCreator";

/**
 * `/new?tool=…&model=…&prompt=…`: creates a chart (in the default workspace
 * unless `workspaceId` is given) and replaces the URL with its page. A
 * workshop participant goes to their workshop instead.
 */
export default async function NewChartPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await redirectWorkshopParticipant(await getSessionUser());
    const request = chartLaunchFromSearchParams(await searchParams);
    return <NewChartCreator key={JSON.stringify(request)} request={request} />;
}
