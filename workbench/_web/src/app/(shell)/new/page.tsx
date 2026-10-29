import { chartLaunchFromSearchParams } from "@/lib/chartLaunch";
import { NewChartCreator } from "./components/NewChartCreator";

/**
 * `/new?tool=…&model=…&prompt=…`: creates a chart (in the default workspace
 * unless `workspaceId` is given) and replaces the URL with its page.
 */
export default async function NewChartPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const request = chartLaunchFromSearchParams(await searchParams);
    return <NewChartCreator key={JSON.stringify(request)} request={request} />;
}
