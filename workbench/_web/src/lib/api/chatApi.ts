import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { GenerationData } from "nnsightful";
import { toast } from "sonner";

import { createUserHeadersAction } from "@/actions/auth";
import type { Chat, ChatMessage } from "@/db/schema";
import { useCapture, useTrackRun, type RunTrigger } from "@/lib/analytics";
import { ItemAnalytics } from "@/lib/api/workspaceApi";
import config from "@/lib/config";
import { conversationBefore, replyRun } from "@/lib/chats";
import { captureError } from "@/lib/errorTracking";
import { NDIFJobError, runErrorMessage } from "@/lib/ndifError";
import {
    addChatTurn,
    createChat,
    deleteChat,
    getChat,
    getChatMessages,
    regenerateReply,
    showBranch,
    updateChat,
    updateChatMessage,
} from "@/lib/queries/chatQueries";
import type { NewChatRequest, ChatSettings } from "@/lib/queries/chatDb";
import { queryKeys } from "@/lib/queryKeys";
import { runAndStream } from "@/lib/runAndStream";
import { DEFAULT_GENERATION_PARAMS, type ReplyRun } from "@/types/chats";
import type { WorkspaceLibrary } from "@/types/workspaces";

export const useChat = (chatId: string) =>
    useQuery({
        queryKey: queryKeys.chats.chat(chatId),
        queryFn: () => getChat(chatId),
        enabled: !!chatId,
    });

export const useChatMessages = (chatId: string) =>
    useQuery({
        queryKey: queryKeys.chats.messages(chatId),
        queryFn: () => getChatMessages(chatId),
        enabled: !!chatId,
    });

/** Where a chat was created from: the sidebar's New menu or a folder page's. */
export type ChatOrigin = "sidebar" | "workspace_page";

/**
 * Creates a chat (in the default workspace unless `workspaceId` names a
 * folder) and fills its queries, so its page opens without fetching them.
 * `origin` says which surface offered it.
 */
export const useCreateChat = (origin: ChatOrigin = "sidebar") => {
    const queryClient = useQueryClient();
    const capture = useCapture();

    return useMutation({
        mutationKey: ["createChat"],
        mutationFn: (request: NewChatRequest) => createChat(request),
        onSuccess: (chat) => {
            capture("chat_created", {
                chat_id: chat.id,
                workspace_id: chat.workspaceId,
                model: chat.model,
                chat_mode: chat.mode,
                origin,
            });
            queryClient.setQueryData(queryKeys.chats.chat(chat.id), chat);
            queryClient.setQueryData(queryKeys.chats.messages(chat.id), []);
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
        },
        onError: () => toast.error("Couldn't create the chat"),
    });
};

/** The library with one chat renamed, so the sidebar shows a rename before the refetch lands. */
const renameInLibrary = (library: WorkspaceLibrary, chatId: string, name: string) => {
    const rename = <T extends WorkspaceLibrary["defaultItems"][number]>(item: T): T =>
        item.kind === "chat" && item.id === chatId ? { ...item, name } : item;
    return {
        ...library,
        defaultItems: library.defaultItems.map(rename),
        workspaces: library.workspaces.map((w) => ({ ...w, items: w.items.map(rename) })),
    };
};

/** Renames a chat or changes its model, mode or generation settings. */
export const useUpdateChat = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ chatId, settings }: { chatId: string; settings: ChatSettings }) =>
            updateChat(chatId, settings),
        onMutate: ({ chatId, settings }) => {
            const { params, ...columns } = settings;
            queryClient.setQueryData<Chat | null>(queryKeys.chats.chat(chatId), (chat) =>
                chat
                    ? { ...chat, ...columns, ...(params && { data: { ...chat.data, params } }) }
                    : chat,
            );
            if (settings.name !== undefined) {
                const name = settings.name;
                queryClient.setQueryData<WorkspaceLibrary>(
                    queryKeys.workspaces.library,
                    (library) => (library ? renameInLibrary(library, chatId, name) : library),
                );
            }
        },
        onSuccess: (chat) => {
            queryClient.setQueryData(queryKeys.chats.chat(chat.id), chat);
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
        },
        onError: (_, { chatId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.chats.chat(chatId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
            toast.error("Couldn't update the chat");
        },
    });
};

export const useDeleteChat = () => {
    const queryClient = useQueryClient();
    const capture = useCapture();

    return useMutation({
        mutationKey: ["deleteChat"],
        mutationFn: ({ chatId }: { chatId: string }) => deleteChat(chatId),
        onMutate: ({ chatId }) => ItemAnalytics.chat(queryClient, chatId),
        onSuccess: (_, { chatId }, chat) => {
            capture("chat_deleted", {
                chat_id: chatId,
                workspace_id: chat.workspace_id,
                model: chat.model,
            });
            queryClient.removeQueries({ queryKey: queryKeys.chats.chat(chatId) });
            queryClient.removeQueries({ queryKey: queryKeys.chats.messages(chatId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
        },
    });
};

/** A reply about to run with the chat's current model and settings. */
const pendingReply = (chat: Chat): ReplyRun => ({
    status: "pending",
    model: chat.model,
    params: chat.data.params ?? DEFAULT_GENERATION_PARAMS,
});

/** Replies running in this tab. A pending reply that isn't one was interrupted (e.g. by a reload). */
const runningReplies = new Set<string>();

export const isReplyRunning = (messageId: string) => runningReplies.has(messageId);

type TrackRun = ReturnType<typeof useTrackRun>;

/** What a failed reply shows: NDIF's advice for a known failure, else the error's own message. */
const replyErrorMessage = (error: unknown): string =>
    error instanceof NDIFJobError
        ? runErrorMessage(error, "The reply failed on NDIF")
        : error instanceof Error
          ? error.message
          : String(error);

/**
 * Generates the pending reply `reply` from the messages before it and saves
 * its outcome on the message: the text, or the error, which the chat shows
 * inline with a Retry. Each reply is a tracked run (`useTrackRun`) whose
 * prompt is the message it answers (none for a continuation). Never throws.
 */
async function runReply(
    queryClient: QueryClient,
    trackRun: TrackRun,
    chat: Chat,
    reply: ChatMessage,
    trigger: RunTrigger,
) {
    if (runningReplies.has(reply.id)) return;
    runningReplies.add(reply.id);
    const messagesKey = queryKeys.chats.messages(chat.id);
    const run = replyRun(reply) ?? pendingReply(chat);

    try {
        const messages = queryClient.getQueryData<ChatMessage[]>(messagesKey) ?? [];
        const conversation = conversationBefore(messages, reply);
        const last = conversation[conversation.length - 1];
        const prompt = trigger !== "continue" && last?.role === "user" ? last.content : "";
        let outcome: { content?: string; run: ReplyRun };
        try {
            const request = {
                model: run.model,
                mode: chat.mode,
                messages: conversation,
                max_new_tokens: run.params.maxNewTokens,
                temperature: run.params.temperature,
            };
            const data = await trackRun(
                {
                    tool: "chat",
                    run_kind: chat.mode,
                    trigger,
                    model: request.model,
                    chat_id: chat.id,
                    workspace_id: chat.workspaceId,
                    prompt,
                    prompt_length: prompt.length,
                    message_count: conversation.length,
                    max_new_tokens: request.max_new_tokens,
                    temperature: request.temperature,
                },
                async (jobs) => {
                    const headers = await createUserHeadersAction();
                    return runAndStream<GenerationData>(
                        config.endpoints.chatGenerate,
                        request,
                        headers,
                        jobs,
                    );
                },
            );
            outcome = {
                content: data.text,
                run: {
                    ...run,
                    status: "complete",
                    finishReason: data.finish_reason,
                    nTokens: data.completion_ids.length,
                },
            };
        } catch (error) {
            outcome = {
                run: { ...run, status: "error", error: replyErrorMessage(error) },
            };
        }
        await updateChatMessage(reply.id, outcome).catch((error) =>
            captureError(error, { source: "chat_reply_save" }),
        );
    } finally {
        runningReplies.delete(reply.id);
        queryClient.invalidateQueries({ queryKey: messagesKey });
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
    }
}

/** Shows a new reply at the end of the chat's branch on screen, before its run settles. */
const showNewReply = async (queryClient: QueryClient, chat: Chat, reply: ChatMessage) => {
    queryClient.setQueryData<Chat | null>(queryKeys.chats.chat(chat.id), (current) =>
        current ? { ...current, headMessageId: reply.id } : current,
    );
    await queryClient.invalidateQueries({ queryKey: queryKeys.chats.messages(chat.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
};

/**
 * Sends a message (or, with empty content, asks for a continuation) at the
 * end of the branch on screen and runs the reply. Resolves once the reply has
 * settled.
 */
export const useSendChatMessage = (chat: Chat | null | undefined) => {
    const queryClient = useQueryClient();
    const trackRun = useTrackRun();

    return useMutation({
        mutationKey: ["chat-reply", chat?.id],
        mutationFn: async (content: string) => {
            if (!chat) return;
            const added = await addChatTurn(chat.id, { content, reply: pendingReply(chat) });
            const reply = added[added.length - 1];
            await showNewReply(queryClient, chat, reply);
            queryClient.invalidateQueries({ queryKey: queryKeys.chats.chat(chat.id) });
            await runReply(queryClient, trackRun, chat, reply, content ? "run" : "continue");
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't send"),
    });
};

/**
 * Runs a reply again with the chat's current settings. Retry reruns a failed
 * reply in its place (it has no text to keep); Regenerate starts a new reply
 * beside the last one, which stays as another branch.
 */
export const useRerunReply = (chat: Chat | null | undefined) => {
    const queryClient = useQueryClient();
    const trackRun = useTrackRun();

    return useMutation({
        mutationKey: ["chat-reply", chat?.id],
        mutationFn: async ({
            reply,
            trigger,
        }: {
            reply: ChatMessage;
            trigger: "retry" | "regenerate";
        }) => {
            if (!chat) return;
            if (trigger === "regenerate") {
                const sibling = await regenerateReply(chat.id, reply.id, pendingReply(chat));
                await showNewReply(queryClient, chat, sibling);
                await runReply(queryClient, trackRun, chat, sibling, trigger);
                return;
            }
            const reset = await updateChatMessage(reply.id, {
                content: "",
                run: pendingReply(chat),
            });
            queryClient.setQueryData<ChatMessage[]>(queryKeys.chats.messages(chat.id), (messages) =>
                messages?.map((m) => (m.id === reset.id ? reset : m)),
            );
            await runReply(queryClient, trackRun, chat, reset, trigger);
        },
        onError: () => toast.error("Couldn't run the reply again"),
    });
};

/** Shows another branch of a chat: the one through the given message. */
export const useShowBranch = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: ["showBranch"],
        mutationFn: ({ chatId, messageId }: { chatId: string; messageId: string }) =>
            showBranch(chatId, messageId),
        onSuccess: (chat) => queryClient.setQueryData(queryKeys.chats.chat(chat.id), chat),
        onError: () => toast.error("Couldn't show that version"),
    });
};

/** Marks a reply that was pending when the chat opened, but runs nowhere, as interrupted. */
export const markReplyInterrupted = async (queryClient: QueryClient, reply: ChatMessage) => {
    const run = replyRun(reply);
    if (runningReplies.has(reply.id) || !run) return;
    await updateChatMessage(reply.id, {
        run: {
            ...run,
            status: "error",
            error: "Interrupted: the page was closed or reloaded while the reply was generating.",
        },
    }).catch((error) => captureError(error, { source: "chat_reply_interrupted" }));
    queryClient.invalidateQueries({ queryKey: queryKeys.chats.messages(reply.chatId) });
};
