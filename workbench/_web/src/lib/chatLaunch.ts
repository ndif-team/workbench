import { defaultModel } from "@/components/model-selector/status";
import type { ChartLaunchRequest, ChartOrigin } from "@/lib/chartLaunch";
import { chatModeFor } from "@/lib/chats";
import {
    chatModes,
    DEFAULT_GENERATION_PARAMS,
    type ChatDraft,
    type ChatMode,
    type GenerationParams,
} from "@/types/chats";
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
 * `/new?tool=Chat&model=…&prompt=…` links (the landing page's after sign-in),
 * which can name the chat's settings too (`temperature`, `maxNewTokens`).
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
     * prompt as the first message, in its folder, and with the settings it
     * names (`params`). Null when that takes the model catalog and `models`
     * isn't given, or no model is known.
     */
    static draft(request: ChartLaunchRequest, models?: Model[]): ChatDraft | null {
        const named = chatModes.find((mode) => mode === request.mode);
        const model = request.model || (models && defaultModel(models, (m) => m.is_chat)?.name);
        if (!model) return null;
        let mode: ChatMode;
        if (named) mode = named;
        else if (models) mode = chatModeFor(models.find((m) => m.name === model));
        else return null;
        const params = ChatLaunch.params(request);
        return {
            model,
            mode,
            content: request.prompt ?? "",
            ...(request.workspaceId && { workspaceId: request.workspaceId }),
            ...(params && { params }),
        };
    }

    /** `params` as a launch URL carries them: only those that differ from the defaults. */
    static tagParams(query: URLSearchParams, params: GenerationParams): void {
        if (params.temperature !== DEFAULT_GENERATION_PARAMS.temperature) {
            query.set("temperature", String(params.temperature));
        }
        if (params.maxNewTokens !== DEFAULT_GENERATION_PARAMS.maxNewTokens) {
            query.set("maxNewTokens", String(params.maxNewTokens));
        }
    }

    /**
     * The settings a launch names; a value missing or out of the range the
     * app offers is the default's. None when it names neither.
     */
    private static params(request: ChartLaunchRequest): GenerationParams | undefined {
        if (request.temperature === undefined && request.maxNewTokens === undefined) return;
        const temperature = Number(request.temperature);
        const maxNewTokens = Number(request.maxNewTokens);
        return {
            temperature:
                request.temperature && temperature >= 0 && temperature <= 2
                    ? temperature
                    : DEFAULT_GENERATION_PARAMS.temperature,
            maxNewTokens:
                Number.isInteger(maxNewTokens) && maxNewTokens >= 1 && maxNewTokens <= 2048
                    ? maxNewTokens
                    : DEFAULT_GENERATION_PARAMS.maxNewTokens,
        };
    }
}
