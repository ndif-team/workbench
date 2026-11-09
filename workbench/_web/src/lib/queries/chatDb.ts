import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { chatMessages, chats, isUuid, jsonTextField, workspaces } from "@/db/schema";
import type { Chat, ChatMessage } from "@/db/schema";
import { chatTitleFrom, isPendingReply, latestLeaf, placeTurn } from "@/lib/chats";
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
        .orderBy(chatMessages.position, chatMessages.createdAt)) as ChatMessage[];
};

/** One message of one of the user's chats, or null. */
const getMessage = async (userId: string, messageId: string): Promise<ChatMessage | null> => {
    if (!isUuid(messageId)) return null;
    const [message] = await db
        .select()
        .from(chatMessages)
        .where(
            and(eq(chatMessages.id, messageId), inArray(chatMessages.chatId, userChatIds(userId))),
        )
        .limit(1);
    return (message ?? null) as ChatMessage | null;
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
const touchChat = async (
    chatId: string,
    values: { name?: string; headMessageId?: string } = {},
) => {
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

/** The ids the page picked for a turn's messages, so it could show them first. */
export type TurnIds = { user?: string; reply: string };

/** `id` when the page picked one (it must be a UUID), else a new one. */
const messageId = (id: string | undefined): string => {
    if (id === undefined) return crypto.randomUUID();
    if (!isUuid(id)) throw new Error("Invalid message id");
    return id;
};

/**
 * Appends a user message and a pending reply to it at the end of the branch
 * on screen in one of the user's chats, makes the reply the branch's end, and
 * returns them. An empty `content` adds the reply alone (a completion's
 * Continue). Where the turn goes follows `placeTurn`: a failed reply at the
 * end is dropped, and in chat mode a message sent after an unanswered one
 * becomes another version of it. Refused while the branch's last reply is
 * pending. A chat still under its default name is named after its first
 * message. `ids` are the ids the page showed the turn under.
 */
export const addChatTurn = async (
    userId: string,
    chatId: string,
    { content, reply, ids }: { content: string; reply: ReplyRun; ids?: TurnIds },
): Promise<ChatMessage[]> => {
    checkLength(content);
    const chat = await getChat(userId, chatId);
    if (!chat) throw chatNotFound();

    const messages = await getChatMessages(userId, chatId);
    const head = messages.find((m) => m.id === chat.headMessageId);
    if (head && isPendingReply(head)) {
        throw new Error("Wait for the reply before sending another message");
    }
    const place = placeTurn(messages, chat.headMessageId, chat.mode, !!content);
    if (place.dropId) await db.delete(chatMessages).where(eq(chatMessages.id, place.dropId));

    const userMessage = content
        ? {
              id: messageId(ids?.user),
              chatId,
              parentId: place.parentId,
              content,
              position: place.depth,
              data: { role: "user" as const },
          }
        : null;
    const rows = [
        ...(userMessage ? [userMessage] : []),
        {
            id: messageId(ids?.reply),
            chatId,
            parentId: userMessage?.id ?? place.parentId,
            content: "",
            position: userMessage ? place.depth + 1 : place.depth,
            data: { role: "assistant" as const, run: reply },
        },
    ];
    const inserted = (await db.insert(chatMessages).values(rows).returning()) as ChatMessage[];
    const named = chat.name === DEFAULT_CHAT_NAME && content;
    await touchChat(chatId, {
        headMessageId: rows[rows.length - 1].id,
        ...(named && { name: chatTitleFrom(content) }),
    });
    return inserted;
};

/**
 * Starts a new reply beside `replyId` in one of the user's chats (Regenerate):
 * a pending sibling that follows the same message, which becomes the end of
 * the branch on screen. The earlier reply stays, as another branch. `id` is
 * the id the page showed the new reply under.
 */
export const regenerateReply = async (
    userId: string,
    chatId: string,
    replyId: string,
    run: ReplyRun,
    id?: string,
): Promise<ChatMessage> => {
    const [chat, reply] = await Promise.all([getChat(userId, chatId), getMessage(userId, replyId)]);
    if (!chat || !reply || reply.chatId !== chatId || reply.data.role !== "assistant") {
        throw new Error("Reply not found or access denied");
    }
    const head = chat.headMessageId ? await getMessage(userId, chat.headMessageId) : null;
    if (head && isPendingReply(head)) {
        throw new Error("Wait for the reply before running another");
    }

    const [sibling] = (await db
        .insert(chatMessages)
        .values({
            id: messageId(id),
            chatId,
            parentId: reply.parentId,
            content: "",
            position: reply.position,
            data: { role: "assistant" as const, run },
        })
        .returning()) as ChatMessage[];
    await touchChat(chatId, { headMessageId: sibling.id });
    return sibling;
};

/**
 * Shows the branch through `messageId` in one of the user's chats: its end
 * becomes the newest message below `messageId`, following the newest at each
 * step. Returns the chat.
 */
export const showBranch = async (
    userId: string,
    chatId: string,
    messageId: string,
): Promise<Chat> => {
    const messages = await getChatMessages(userId, chatId);
    if (!messages.some((m) => m.id === messageId)) {
        throw new Error("Message not found or access denied");
    }
    const [chat] = await db
        .update(chats)
        .set({ headMessageId: latestLeaf(messages, messageId) })
        .where(isUserChat(userId, chatId))
        .returning();
    if (!chat) throw chatNotFound();
    return chat as Chat;
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
