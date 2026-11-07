"use server";

import type { Chat, ChatMessage } from "@/db/schema";
import { requireUser, requireUserId } from "@/lib/auth/user";
import * as chatDb from "@/lib/queries/chatDb";
import { hasWorkshopClaim } from "@/lib/workshop";
import type { ChatMessageMetadata } from "@/types/chats";

/**
 * The chat RPC surface. Every export is a public endpoint, so each one
 * resolves the signed-in user itself and acts only on that user's chats; the
 * unguarded internals live in chatDb.ts.
 */

/** Creates a chat for the signed-in user (workshop participants have none). */
export async function createChat(request: chatDb.NewChatRequest): Promise<Chat> {
    const user = await requireUser();
    if (hasWorkshopClaim(user)) throw new Error("Chats aren't available in a workshop");
    return chatDb.createChat(user.id, request);
}

/** One of the signed-in user's chats, or null. */
export async function getChat(chatId: string): Promise<Chat | null> {
    return chatDb.getChat(await requireUserId(), chatId);
}

/** The messages of one of the signed-in user's chats, in order. */
export async function getChatMessages(chatId: string): Promise<ChatMessage[]> {
    return chatDb.getChatMessages(await requireUserId(), chatId);
}

/** Renames one of the signed-in user's chats or changes its settings. */
export async function updateChat(chatId: string, settings: chatDb.ChatSettings): Promise<Chat> {
    return chatDb.updateChat(await requireUserId(), chatId, settings);
}

/** Deletes one of the signed-in user's chats. */
export async function deleteChat(chatId: string): Promise<void> {
    return chatDb.deleteChat(await requireUserId(), chatId);
}

/** Appends a message and a pending reply to one of the signed-in user's chats. */
export async function addChatTurn(
    chatId: string,
    turn: { content: string; reply: ChatMessageMetadata },
): Promise<ChatMessage[]> {
    return chatDb.addChatTurn(await requireUserId(), chatId, turn);
}

/** Saves a reply's outcome, or resets it for a retry, in one of the signed-in user's chats. */
export async function updateChatMessage(
    messageId: string,
    values: { content?: string; metadata?: ChatMessageMetadata },
): Promise<ChatMessage> {
    return chatDb.updateChatMessage(await requireUserId(), messageId, values);
}
