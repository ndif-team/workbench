import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { chatMessages, chats, isUuid, workspaces } from "@/db/schema";
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
    type ChatMessageMetadata,
    type ChatMode,
    type GenerationParams,
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

export type ChatSettings = Partial<Pick<Chat, "name" | "model" | "mode" | "params">>;

/**
 * The settings a client sent, checked: they come from a public server action,
 * so a mode, generation setting or name outside what the app offers is refused.
 */
const validSettings = ({ name, model, mode, params }: ChatSettings): ChatSettings => {
    if (mode !== undefined && !chatModes.includes(mode)) throw new Error(`Unknown mode: ${mode}`);
    if (
        params != null &&
        !(
            params.temperature >= 0 &&
            params.temperature <= 2 &&
            Number.isInteger(params.maxNewTokens) &&
            params.maxNewTokens >= 1 &&
            params.maxNewTokens <= 2048
        )
    ) {
        throw new Error("Temperature must be 0 to 2, and max new tokens 1 to 2048");
    }
    return {
        ...(name !== undefined && { name: name.trim().slice(0, 256) || DEFAULT_CHAT_NAME }),
        ...(model !== undefined && { model: model.slice(0, 256) }),
        ...(mode !== undefined && { mode }),
        ...(params !== undefined && { params }),
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
            ...validSettings({
                model: request.model,
                mode: request.mode,
                params: request.params ?? DEFAULT_GENERATION_PARAMS,
            }),
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

/** Renames one of the user's chats or changes its model, mode or generation settings. */
export const updateChat = async (
    userId: string,
    chatId: string,
    settings: ChatSettings,
): Promise<Chat> => {
    const [chat] = await db
        .update(chats)
        .set(validSettings(settings))
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
    { content, reply }: { content: string; reply: ChatMessageMetadata },
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
                ...(content ? [{ chatId, role: "user" as const, content, position: next }] : []),
                {
                    chatId,
                    role: "assistant" as const,
                    content: "",
                    position: content ? next + 1 : next,
                    metadata: reply,
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
 * Updates a message in one of the user's chats: a reply's text and metadata
 * as its run ends, or a retry setting it back to pending.
 */
export const updateChatMessage = async (
    userId: string,
    messageId: string,
    values: { content?: string; metadata?: ChatMessageMetadata },
): Promise<ChatMessage> => {
    if (values.content !== undefined) checkLength(values.content);
    const [message] = await db
        .update(chatMessages)
        .set(values)
        .where(
            and(eq(chatMessages.id, messageId), inArray(chatMessages.chatId, userChatIds(userId))),
        )
        .returning();
    if (!message) throw new Error("Message not found or access denied");
    await touchChat(message.chatId);
    return message as ChatMessage;
};
