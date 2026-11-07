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

/**
 * What the reply at `index` is generated from: the messages before it,
 * leaving out replies that failed or are still running (they hold no text).
 */
export const conversationBefore = (
    messages: Pick<ChatMessage, "content" | "data">[],
    index: number,
): { role: ChatRole; content: string }[] =>
    messages
        .slice(0, index)
        .filter((m) => m.data.role !== "assistant" || replyStatus(m) === "complete")
        .map(({ data, content }) => ({ role: data.role, content }));
