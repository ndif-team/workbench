import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { GenerationData } from "nnsightful";
import { toast } from "sonner";

import { createUserHeadersAction } from "@/actions/auth";
import type { Chat, ChatMessage } from "@/db/schema";
import config from "@/lib/config";
import { conversationBefore } from "@/lib/chats";
import {
    addChatTurn,
    createChat,
    deleteChat,
    getChat,
    getChatMessages,
    updateChat,
    updateChatMessage,
} from "@/lib/queries/chatQueries";
import type { NewChatRequest, ChatSettings } from "@/lib/queries/chatDb";
import { queryKeys } from "@/lib/queryKeys";
import { runAndStream } from "@/lib/runAndStream";
import { DEFAULT_GENERATION_PARAMS, type ChatMessageMetadata } from "@/types/chats";
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

/**
 * Creates a chat (in the default workspace unless `workspaceId` names a
 * folder) and fills its queries, so its page opens without fetching them.
 */
export const useCreateChat = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (request: NewChatRequest) => createChat(request),
        onSuccess: (chat) => {
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
            queryClient.setQueryData<Chat | null>(queryKeys.chats.chat(chatId), (chat) =>
                chat ? { ...chat, ...settings } : chat,
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

    return useMutation({
        mutationFn: ({ chatId }: { chatId: string }) => deleteChat(chatId),
        onSuccess: (_, { chatId }) => {
            queryClient.removeQueries({ queryKey: queryKeys.chats.chat(chatId) });
            queryClient.removeQueries({ queryKey: queryKeys.chats.messages(chatId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
        },
    });
};

/** A reply about to run with the chat's current model and settings. */
const pendingReply = (chat: Chat): ChatMessageMetadata => ({
    status: "pending",
    model: chat.model,
    params: chat.params ?? DEFAULT_GENERATION_PARAMS,
});

/** Replies running in this tab. A pending reply that isn't one was interrupted (e.g. by a reload). */
const runningReplies = new Set<string>();

export const isReplyRunning = (messageId: string) => runningReplies.has(messageId);

/**
 * Generates the pending reply `reply` from the messages before it and saves
 * its outcome on the message: the text, or the error, which the chat shows
 * inline with a Retry. Never throws.
 */
async function runReply(queryClient: QueryClient, chat: Chat, reply: ChatMessage) {
    if (runningReplies.has(reply.id)) return;
    runningReplies.add(reply.id);
    const messagesKey = queryKeys.chats.messages(chat.id);
    const metadata = reply.metadata ?? pendingReply(chat);

    try {
        const messages = queryClient.getQueryData<ChatMessage[]>(messagesKey) ?? [];
        const index = messages.findIndex((m) => m.id === reply.id);
        const conversation = conversationBefore(messages, index === -1 ? messages.length : index);
        let outcome: { content?: string; metadata: ChatMessageMetadata };
        try {
            const headers = await createUserHeadersAction();
            const data = await runAndStream<GenerationData>(
                config.endpoints.chatGenerate,
                {
                    model: metadata.model,
                    mode: chat.mode,
                    messages: conversation,
                    max_new_tokens: metadata.params.maxNewTokens,
                    temperature: metadata.params.temperature,
                },
                headers,
            );
            outcome = {
                content: data.text,
                metadata: {
                    ...metadata,
                    status: "complete",
                    finishReason: data.finish_reason,
                    nTokens: data.completion_ids.length,
                },
            };
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            outcome = { metadata: { ...metadata, status: "error", error } };
        }
        await updateChatMessage(reply.id, outcome).catch(() => undefined);
    } finally {
        runningReplies.delete(reply.id);
        queryClient.invalidateQueries({ queryKey: messagesKey });
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
    }
}

/**
 * Sends a message (or, with empty content, asks for a continuation) and runs
 * the reply. Resolves once the reply has settled.
 */
export const useSendChatMessage = (chat: Chat | null | undefined) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: ["chat-reply", chat?.id],
        mutationFn: async (content: string) => {
            if (!chat) return;
            const added = await addChatTurn(chat.id, { content, reply: pendingReply(chat) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.chats.messages(chat.id) });
            queryClient.invalidateQueries({ queryKey: queryKeys.chats.chat(chat.id) });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
            await runReply(queryClient, chat, added[added.length - 1]);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't send"),
    });
};

/**
 * Runs a reply again with the chat's current settings: a failed one (Retry)
 * or the last one (Regenerate), replaced in place.
 */
export const useRerunReply = (chat: Chat | null | undefined) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: ["chat-reply", chat?.id],
        mutationFn: async (reply: ChatMessage) => {
            if (!chat) return;
            const reset = await updateChatMessage(reply.id, {
                content: "",
                metadata: pendingReply(chat),
            });
            queryClient.setQueryData<ChatMessage[]>(queryKeys.chats.messages(chat.id), (messages) =>
                messages?.map((m) => (m.id === reset.id ? reset : m)),
            );
            await runReply(queryClient, chat, reset);
        },
        onError: () => toast.error("Couldn't run the reply again"),
    });
};

/** Marks a reply that was pending when the chat opened, but runs nowhere, as interrupted. */
export const markReplyInterrupted = async (queryClient: QueryClient, reply: ChatMessage) => {
    if (runningReplies.has(reply.id) || !reply.metadata) return;
    await updateChatMessage(reply.id, {
        metadata: {
            ...reply.metadata,
            status: "error",
            error: "Interrupted: the page was closed or reloaded while the reply was generating.",
        },
    }).catch(() => undefined);
    queryClient.invalidateQueries({ queryKey: queryKeys.chats.messages(reply.chatId) });
};
