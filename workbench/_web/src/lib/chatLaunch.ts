import { defaultModel } from "@/components/model-selector/status";
import type { ChartLaunchRequest, ChartOrigin } from "@/lib/chartLaunch";
import { chatModeFor } from "@/lib/chats";
import { chatModes, type ChatDraft, type ChatMode } from "@/types/chats";
import type { Model } from "@/types/models";

/**
 * Where a chat was created from, reported as `chat_created`'s `origin`: the
 * sidebar's New menu or a folder page's, Home's or the landing page's
 * composer, a `/new?tool=Chat` link, or a launch resumed after sign-in.
 */
export type ChatOrigin = Extract<
    ChartOrigin,
    "sidebar" | "workspace_page" | "home" | "landing" | "new_link" | "resumed" | "chat_page"
>;

/**
 * A launch that starts a chat rather than a chart: the composer's Chat, and
 * `/new?tool=Chat&model=…&prompt=…` links (the landing page's after sign-in).
 */
export class ChatLaunch {
    /** The `tool` a launch names to start a chat, as the composer's picker shows it. */
    static readonly TOOL = "Chat";

    private static readonly ORIGINS: readonly ChatOrigin[] = [
        "sidebar",
        "workspace_page",
        "home",
        "landing",
        "new_link",
        "resumed",
    ];

    /** A `/new` URL's origin as a chat's: a plain link when it names a surface that starts no chats. */
    static origin(origin: ChartOrigin): ChatOrigin {
        return ChatLaunch.ORIGINS.find((o) => o === origin) ?? "new_link";
    }

    static is(request: Pick<ChartLaunchRequest, "tool">): boolean {
        return request.tool?.toLowerCase() === ChatLaunch.TOOL.toLowerCase();
    }

    /**
     * The chat a launch starts: on the request's model, else the default chat
     * model; in the mode it names, else its model's (`chatModeFor`); with its
     * prompt as the first message, in its folder. Null when that takes the
     * model catalog and `models` isn't given, or no model is known.
     */
    static draft(request: ChartLaunchRequest, models?: Model[]): ChatDraft | null {
        const named = chatModes.find((mode) => mode === request.mode);
        const model = request.model || (models && defaultModel(models, (m) => m.is_chat)?.name);
        if (!model) return null;
        let mode: ChatMode;
        if (named) mode = named;
        else if (models) mode = chatModeFor(models.find((m) => m.name === model));
        else return null;
        return {
            model,
            mode,
            content: request.prompt ?? "",
            ...(request.workspaceId && { workspaceId: request.workspaceId }),
        };
    }
}
