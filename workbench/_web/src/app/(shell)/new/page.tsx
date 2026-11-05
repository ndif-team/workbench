import { getSessionUser, redirectWorkshopParticipant } from "@/lib/auth/user";
import { ChartOrigins, chartLaunchFromSearchParams } from "@/lib/chartLaunch";
import { NewChartCreator } from "./components/NewChartCreator";

/**
 * `/new?tool=…&model=…&prompt=…`: creates a chart (in the default workspace
 * unless `workspaceId` is given) and replaces the URL with its page. `origin`
 * names the launch's surface for analytics (`ChartOrigins`); a plain link has
 * none. A workshop participant goes to their workshop instead.
 */
export default async function NewChartPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await redirectWorkshopParticipant(await getSessionUser());
    const params = await searchParams;
    const request = chartLaunchFromSearchParams(params);
    return (
        <NewChartCreator
            key={JSON.stringify(request)}
            request={request}
            origin={ChartOrigins.fromSearchParams(params)}
        />
    );
}
