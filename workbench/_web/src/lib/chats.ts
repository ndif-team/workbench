import type { ChatMessage } from "@/db/schema";
import type { ChatMode, ChatReplyStatus, ChatRole, ReplyRun } from "@/types/chats";
import type { Model } from "@/types/models";

const TITLE_LENGTH = 60;

/** A chat's name taken from its first message: the first line, cut to 60 characters. */
export const chatTitleFrom = (content: string): string => {
    const line = content.trim().split("\n")[0].replace(/\s+/g, " ");
    return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : line;
};

/** How a chat with `model` runs: its chat template for a chat model, else completion. */
export const chatModeFor = (model: Pick<Model, "is_chat"> | undefined): ChatMode =>
    model?.is_chat ? "chat" : "completion";

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
