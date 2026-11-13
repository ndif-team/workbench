import type { Chat, ChatMessage } from "@/db/schema";
import type { ChatMode, ChatReplyStatus, ChatRole, ReplyRun } from "@/types/chats";
import type { Model } from "@/types/models";

const TITLE_LENGTH = 60;

/** A chat's name taken from its first message: the first line, cut to 60 characters. */
export const chatTitleFrom = (content: string): string => {
    const line = content.trim().split("\n")[0].replace(/\s+/g, " ");
    return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : line;
};

/** A message the page shows before the server has written it. */
export const draftMessage = (
    chatId: string,
    fields: Pick<ChatMessage, "id" | "parentId" | "content" | "position" | "data">,
): ChatMessage => {
    const now = new Date();
    return { ...fields, chatId, createdAt: now, updatedAt: now };
};

/** How a chat with `model` runs: its chat template for a chat model, else completion. */
export const chatModeFor = (model: Pick<Model, "is_chat"> | undefined): ChatMode =>
    model?.is_chat ? "chat" : "completion";

/**
 * Whether a chat's mode is settled: its first message settles it. Each mode
 * keeps a conversation in its own shape (turns read through the model's chat
 * template, or one text), so the other mode would misread it.
 */
export const isModeLocked = (chat: Pick<Chat, "headMessageId">): boolean =>
    chat.headMessageId !== null;

/**
 * What moving `chat` to the model `name` changes: the model, and the mode too
 * until the first message (that model's own, `chatModeFor`). After it, the
 * mode stays: a completion takes any model, and a chat only a chat model, so
 * this is null for a base model, which has no chat template to read the turns
 * with.
 */
export const settingsForModel = (
    chat: Pick<Chat, "mode" | "headMessageId">,
    name: string,
    model: Pick<Model, "is_chat"> | undefined,
): { model: string; mode?: ChatMode } | null => {
    if (!isModeLocked(chat)) return { model: name, mode: chatModeFor(model) };
    if (chat.mode === "chat" && model && !model.is_chat) return null;
    return { model: name };
};

/** The run that produced a reply; null for a user or system message. */
export const replyRun = (message: Pick<ChatMessage, "data">): ReplyRun | null =>
    message.data.role === "assistant" ? message.data.run : null;

/** A reply's run state; null for a user or system message. */
export const replyStatus = (message: Pick<ChatMessage, "data">): ChatReplyStatus | null =>
    replyRun(message)?.status ?? null;

export const isPendingReply = (message: Pick<ChatMessage, "data">) =>
    replyStatus(message) === "pending";

export const isFailedReply = (message: Pick<ChatMessage, "data">) =>
    replyStatus(message) === "error";

type TreeMessage = Pick<ChatMessage, "id" | "parentId" | "createdAt">;

/** Oldest first; messages added together are told apart by id. */
const byAge = (a: TreeMessage, b: TreeMessage) =>
    a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

/** The branch ending at `leafId`: its messages from the chat's first to the leaf. */
export const branchTo = <M extends Pick<ChatMessage, "id" | "parentId">>(
    messages: M[],
    leafId: string | null | undefined,
): M[] => {
    const byId = new Map(messages.map((m) => [m.id, m]));
    const branch: M[] = [];
    for (let m = leafId ? byId.get(leafId) : undefined; m; m = byId.get(m.parentId ?? "")) {
        branch.push(m);
    }
    return branch.reverse();
};

/** The messages that follow the same message as `message`, itself included, oldest first. */
export const siblingsOf = <M extends TreeMessage>(messages: M[], message: M): M[] =>
    messages.filter((m) => m.parentId === message.parentId).sort(byAge);

/** The last message of the branch through `messageId` that follows the newest message at each step. */
export const latestLeaf = (messages: TreeMessage[], messageId: string): string => {
    let leaf = messageId;
    for (;;) {
        const children = messages.filter((m) => m.parentId === leaf).sort(byAge);
        if (children.length === 0) return leaf;
        leaf = children[children.length - 1].id;
    }
};

/**
 * Where a new turn goes on the branch ending at `headId`: the message it
 * follows (null at the start of a chat), its depth, and a failed reply at the
 * end to drop first. In chat mode a message never follows another user
 * message (strict chat templates refuse two user turns in a row), so one sent
 * after an unanswered message becomes another version of it. Shared by the
 * server, which writes the turn, and the page, which shows it at once.
 */
export const placeTurn = (
    messages: Pick<ChatMessage, "id" | "parentId" | "position" | "data">[],
    headId: string | null,
    mode: ChatMode,
    hasContent: boolean,
): { parentId: string | null; depth: number; dropId: string | null } => {
    const byId = new Map(messages.map((m) => [m.id, m]));
    let parent = headId ? byId.get(headId) : undefined;
    let dropId: string | null = null;
    if (parent && isFailedReply(parent)) {
        dropId = parent.id;
        parent = byId.get(parent.parentId ?? "");
    }
    if (mode === "chat" && hasContent && parent?.data.role === "user") {
        parent = byId.get(parent.parentId ?? "");
    }
    return { parentId: parent?.id ?? null, depth: parent ? parent.position + 1 : 0, dropId };
};

/**
 * A new message id (a v4 UUID). The page picks a turn's ids so it can show the
 * turn before the server has written it. `crypto.randomUUID` is missing outside
 * secure contexts (a plain-http preview host), hence the fallback.
 */
export const newMessageId = (): string => {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/**
 * What a reply is generated from: the branch before it, leaving out replies
 * that failed or are still running (they hold no text).
 */
export const conversationBefore = (
    messages: Pick<ChatMessage, "id" | "parentId" | "content" | "data">[],
    message: Pick<ChatMessage, "parentId">,
): { role: ChatRole; content: string }[] =>
    branchTo(messages, message.parentId)
        .filter((m) => m.data.role !== "assistant" || replyStatus(m) === "complete")
        .map(({ data, content }) => ({ role: data.role, content }));
