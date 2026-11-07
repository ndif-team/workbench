/** How a chat's conversation becomes model input (see nnsightful's `generate`). */
export const chatModes = ["chat", "completion"] as const;
/** `chat` applies the model's chat template; `completion` continues one document (base models). */
export type ChatMode = (typeof chatModes)[number];

export const chatRoles = ["system", "user", "assistant"] as const;
export type ChatRole = (typeof chatRoles)[number];

export type GenerationParams = {
    /** 0 decodes greedily. */
    temperature: number;
    maxNewTokens: number;
};

export const DEFAULT_GENERATION_PARAMS: GenerationParams = { temperature: 0.7, maxNewTokens: 256 };

export const DEFAULT_CHAT_NAME = "New chat";

/**
 * A reply's state. `pending` while it generates; `error` when it failed or
 * was interrupted (a reload loses a run in progress), with Retry offered.
 */
export type ChatReplyStatus = "pending" | "complete" | "error";

/** What a reply records about the run that produced it. */
export type ReplyRun = {
    status: ChatReplyStatus;
    model: string;
    params: GenerationParams;
    finishReason?: "stop" | "length";
    nTokens?: number;
    error?: string;
};

/** A chat's `data`: its settings besides its model and mode. */
export type ChatData = {
    params: GenerationParams;
};

/** A message's `data`: who wrote it and, for a reply, the run that produced it. */
export type ChatMessageData =
    | { role: Exclude<ChatRole, "assistant"> }
    | { role: "assistant"; run: ReplyRun };
