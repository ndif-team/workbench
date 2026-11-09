import { getSessionUser, redirectWorkshopParticipant } from "@/lib/auth/user";
import { ChartOrigins, chartLaunchFromSearchParams } from "@/lib/chartLaunch";
import { ChatLaunch } from "@/lib/chatLaunch";
import { NewChartCreator } from "./components/NewChartCreator";
import { NewChatCreator } from "./components/NewChatCreator";

/**
 * `/new?tool=…&model=…&prompt=…`: creates a chart (in the default workspace
 * unless `workspaceId` is given) and replaces the URL with its page;
 * `tool=Chat` starts a chat with `prompt` as its first message instead
 * (`ChatLaunch`). `origin` names the launch's surface for analytics
 * (`ChartOrigins`); a plain link has none. A workshop participant goes to
 * their workshop instead.
 */
export default async function NewItemPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await redirectWorkshopParticipant(await getSessionUser());
    const params = await searchParams;
    const request = chartLaunchFromSearchParams(params);
    const origin = ChartOrigins.fromSearchParams(params);
    const key = JSON.stringify(request);
    return ChatLaunch.is(request) ? (
        <NewChatCreator key={key} request={request} origin={ChatLaunch.origin(origin)} />
    ) : (
        <NewChartCreator key={key} request={request} origin={origin} />
    );
}
