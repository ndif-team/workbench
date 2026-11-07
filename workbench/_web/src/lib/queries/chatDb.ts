import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { chatMessages, chats, isUuid, jsonTextField, workspaces } from "@/db/schema";
import type { Chat, ChatMessage } from "@/db/schema";
import { chatTitleFrom, isFailedReply, isPendingReply } from "@/lib/chats";
import { isUniqueViolation } from "@/lib/queries/workshopDb";
import {
    getNextWorkspaceItemPosition,
    getOrCreateDefaultWorkspace,
    getWorkspaceById,
    touchWorkspace,
} from "@/lib/queries/workspaceDb";
import {
    chatModes,
    DEFAULT_CHAT_NAME,
    DEFAULT_GENERATION_PARAMS,
    type ChatMode,
    type GenerationParams,
    type ReplyRun,
} from "@/types/chats";

/**
 * Unguarded chat DB internals. The "use server" RPC surface lives in
 * chatQueries.ts, which resolves the signed-in user before calling these.
 * Every function takes the acting user and reads or writes only chats in
 * that user's workspaces; a message's owner check goes through its chat.
 */

const MAX_MESSAGE_LENGTH = 100_000;

const userWorkspaceIds = (userId: string) =>
    db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.userId, userId));

/** The chat `chatId`, as a filter that matches only when it is in one of the user's workspaces. */
const isUserChat = (userId: string, chatId: string) =>
    and(eq(chats.id, chatId), inArray(chats.workspaceId, userWorkspaceIds(userId)));

const userChatIds = (userId: string) =>
    db
        .select({ id: chats.id })
        .from(chats)
        .where(inArray(chats.workspaceId, userWorkspaceIds(userId)));

const chatNotFound = () => new Error("Chat not found or access denied");

/** A chat's settings as a client changes them; `params` is kept in the chat's `data`. */
export type ChatSettings = Partial<
    Pick<Chat, "name" | "model" | "mode"> & { params: GenerationParams }
>;

/**
 * Generation settings a client sent, checked: they come from a public server
 * action, so values outside what the app offers are refused.
 */
const validParams = (params: GenerationParams): GenerationParams => {
    const { temperature, maxNewTokens } = params;
    if (!(temperature >= 0 && temperature <= 2)) throw new Error("Temperature must be 0 to 2");
    if (!(Number.isInteger(maxNewTokens) && maxNewTokens >= 1 && maxNewTokens <= 2048)) {
        throw new Error("Max new tokens must be 1 to 2048");
    }
    return { temperature, maxNewTokens };
};

/** Chat settings a client sent, checked like `validParams`. */
const validSettings = ({ name, model, mode, params }: ChatSettings): ChatSettings => {
    if (mode !== undefined && !chatModes.includes(mode)) throw new Error(`Unknown mode: ${mode}`);
    return {
        ...(name !== undefined && { name: name.trim().slice(0, 256) || DEFAULT_CHAT_NAME }),
        ...(model !== undefined && { model: model.slice(0, 256) }),
        ...(mode !== undefined && { mode }),
        ...(params !== undefined && { params: validParams(params) }),
    };
};

export type NewChatRequest = {
    model: string;
    mode: ChatMode;
    params?: GenerationParams;
    /** One of the user's workspaces; omitted, the chat goes to their default workspace. */
    workspaceId?: string | null;
};

/** Creates a chat at the end of its workspace. Workshop workspaces hold no chats. */
export const createChat = async (userId: string, request: NewChatRequest): Promise<Chat> => {
    let workspaceId: string;
    if (request.workspaceId) {
        const workspace = await getWorkspaceById(request.workspaceId);
        if (!workspace || workspace.userId !== userId) {
            throw new Error("Workspace not found or access denied");
        }
        if (workspace.workshopId) throw new Error("A workshop workspace can't hold chats");
        workspaceId = workspace.id;
    } else {
        workspaceId = (await getOrCreateDefaultWorkspace(userId)).id;
    }

    const position = await getNextWorkspaceItemPosition(workspaceId);
    const [chat] = await db
        .insert(chats)
        .values({
            workspaceId,
            name: DEFAULT_CHAT_NAME,
            ...validSettings({ model: request.model, mode: request.mode }),
            data: { params: validParams(request.params ?? DEFAULT_GENERATION_PARAMS) },
            position,
        })
        .returning();
    await touchWorkspace(workspaceId);
    return chat as Chat;
};

/** One of the user's chats, or null. */
export const getChat = async (userId: string, chatId: string): Promise<Chat | null> => {
    if (!isUuid(chatId)) return null;
    const [chat] = await db.select().from(chats).where(isUserChat(userId, chatId)).limit(1);
    return (chat ?? null) as Chat | null;
};

/** The messages of one of the user's chats, in order (none for another user's). */
export const getChatMessages = async (userId: string, chatId: string): Promise<ChatMessage[]> => {
    if (!isUuid(chatId)) return [];
    return (await db
        .select()
        .from(chatMessages)
        .where(
            and(eq(chatMessages.chatId, chatId), inArray(chatMessages.chatId, userChatIds(userId))),
        )
        .orderBy(chatMessages.position)) as ChatMessage[];
};

/**
 * Renames one of the user's chats or changes its model, mode or generation
 * settings. New generation settings are merged into the chat's `data`.
 */
export const updateChat = async (
    userId: string,
    chatId: string,
    settings: ChatSettings,
): Promise<Chat> => {
    const { params, ...columns } = validSettings(settings);
    let data: Chat["data"] | undefined;
    if (params) {
        const current = await getChat(userId, chatId);
        if (!current) throw chatNotFound();
        data = { ...current.data, params };
    }
    const [chat] = await db
        .update(chats)
        .set({ ...columns, ...(data && { data }) })
        .where(isUserChat(userId, chatId))
        .returning();
    if (!chat) throw chatNotFound();
    return chat as Chat;
};

/** Deletes one of the user's chats and its messages. */
export const deleteChat = async (userId: string, chatId: string): Promise<void> => {
    const deleted = await db
        .delete(chats)
        .where(isUserChat(userId, chatId))
        .returning({ id: chats.id });
    if (deleted.length === 0) throw chatNotFound();
    // SQLite has no cascading foreign keys.
    await db.delete(chatMessages).where(eq(chatMessages.chatId, chatId));
};

/** Marks a chat (and its workspace) as just used, so it rises in recent lists. */
const touchChat = async (chatId: string, values: { name?: string } = {}) => {
    const [chat] = await db
        .update(chats)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(chats.id, chatId))
        .returning({ workspaceId: chats.workspaceId });
    if (chat) await touchWorkspace(chat.workspaceId);
};

const checkLength = (content: string) => {
    if (content.length > MAX_MESSAGE_LENGTH) {
        throw new Error(
            `A message can be at most ${MAX_MESSAGE_LENGTH.toLocaleString()} characters`,
        );
    }
};

/**
 * Appends a user message and a pending reply to it to one of the user's
 * chats, and returns them. An empty `content` adds the reply alone (a
 * completion's Continue). A failed reply at the end of the chat is dropped
 * first, so the new message never follows it: strict chat templates refuse
 * two user turns in a row. Refused while a reply is still pending.
 *
 * A chat still under its default name is named after its first message.
 * Positions follow the chat's last message; when a concurrent append takes
 * them first, the unique (chat, position) index refuses this insert and it
 * retries.
 */
export const addChatTurn = async (
    userId: string,
    chatId: string,
    { content, reply }: { content: string; reply: ReplyRun },
): Promise<ChatMessage[]> => {
    checkLength(content);
    const chat = await getChat(userId, chatId);
    if (!chat) throw chatNotFound();

    for (let attempt = 0; ; attempt++) {
        try {
            const [last] = await db
                .select()
                .from(chatMessages)
                .where(eq(chatMessages.chatId, chatId))
                .orderBy(desc(chatMessages.position))
                .limit(1);
            if (last && isPendingReply(last as ChatMessage)) {
                throw new Error("Wait for the reply before sending another message");
            }
            let next = last ? last.position + 1 : 0;
            if (last && isFailedReply(last as ChatMessage)) {
                await db.delete(chatMessages).where(eq(chatMessages.id, last.id));
                next = last.position;
            }

            const rows = [
                ...(content
                    ? [{ chatId, content, position: next, data: { role: "user" as const } }]
                    : []),
                {
                    chatId,
                    content: "",
                    position: content ? next + 1 : next,
                    data: { role: "assistant" as const, run: reply },
                },
            ];
            const inserted = await db.insert(chatMessages).values(rows).returning();
            const named = chat.name === DEFAULT_CHAT_NAME && content;
            await touchChat(chatId, named ? { name: chatTitleFrom(content) } : {});
            return inserted as ChatMessage[];
        } catch (err) {
            if (attempt >= 2 || !isUniqueViolation(err)) throw err;
        }
    }
};

/**
 * Updates a reply in one of the user's chats: its text and run as the run
 * ends, or a retry setting it back to pending. Only replies are updated.
 */
export const updateChatMessage = async (
    userId: string,
    messageId: string,
    { content, run }: { content?: string; run?: ReplyRun },
): Promise<ChatMessage> => {
    if (content !== undefined) checkLength(content);
    const [message] = await db
        .update(chatMessages)
        .set({
            ...(content !== undefined && { content }),
            ...(run && { data: { role: "assistant" as const, run } }),
        })
        .where(
            and(
                eq(chatMessages.id, messageId),
                inArray(chatMessages.chatId, userChatIds(userId)),
                eq(jsonTextField(chatMessages.data, "role"), "assistant"),
            ),
        )
        .returning();
    if (!message) throw new Error("Message not found or access denied");
    await touchChat(message.chatId);
    return message as ChatMessage;
};
