import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";

import { splitRepo } from "@/components/model-selector/status";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/db/schema";
import { replyRun, siblingsOf } from "@/lib/chats";

export type ThreadProps = {
    /** The branch on screen, first message to last. */
    messages: ChatMessage[];
    /** Every message of the chat, every branch: where a message's other versions come from. */
    allMessages: ChatMessage[];
    /** The chat's model, named in the empty state. */
    model: string;
    /** A reply is running: no Regenerate or switching versions until it settles. */
    busy: boolean;
    onRetry: (reply: ChatMessage) => void;
    onRegenerate: (reply: ChatMessage) => void;
    /** Shows the branch through another version of a message. */
    onShowVersion: (messageId: string) => void;
};

/**
 * Steps between a message's versions (a regenerated reply and the replies
 * before it): "‹ 2 / 3 ›". Nothing for a message with one version.
 */
export function VersionSwitcher({
    message,
    allMessages,
    disabled,
    onShowVersion,
}: {
    message: ChatMessage;
    allMessages: ChatMessage[];
    disabled: boolean;
    onShowVersion: (messageId: string) => void;
}) {
    const versions = siblingsOf(allMessages, message);
    if (versions.length < 2) return null;
    const index = versions.findIndex((m) => m.id === message.id);
    const step = (by: number) => onShowVersion(versions[index + by].id);
    return (
        <span className="inline-flex items-center text-xs text-muted-foreground">
            <Button
                variant="ghost"
                size="icon"
                className="size-6"
                disabled={disabled || index === 0}
                onClick={() => step(-1)}
                aria-label="Previous version"
            >
                <ChevronLeft className="size-3.5" />
            </Button>
            <span className="tabular-nums">
                {index + 1} / {versions.length}
            </span>
            <Button
                variant="ghost"
                size="icon"
                className="size-6"
                disabled={disabled || index === versions.length - 1}
                onClick={() => step(1)}
                aria-label="Next version"
            >
                <ChevronRight className="size-3.5" />
            </Button>
        </span>
    );
}

/** A chat-mode conversation: the user's turns on the right, the model's replies below them. */
export function ChatThread({
    messages,
    allMessages,
    model,
    busy,
    onRetry,
    onRegenerate,
    onShowVersion,
}: ThreadProps) {
    if (messages.length === 0) {
        return (
            <p className="py-16 text-center text-sm text-muted-foreground">
                Send a message to start chatting with{" "}
                <span className="font-mono">{splitRepo(model).label}</span>.
            </p>
        );
    }

    const lastIndex = messages.length - 1;
    return (
        <ol className="flex flex-col gap-6" aria-label="Conversation">
            {messages.map((message, i) => (
                <li key={message.id}>
                    {message.data.role === "assistant" ? (
                        <Reply
                            message={message}
                            canRegenerate={i === lastIndex && !busy}
                            onRetry={() => onRetry(message)}
                            onRegenerate={() => onRegenerate(message)}
                            versions={
                                <VersionSwitcher
                                    message={message}
                                    allMessages={allMessages}
                                    disabled={busy}
                                    onShowVersion={onShowVersion}
                                />
                            }
                        />
                    ) : (
                        <div className="flex flex-col items-end gap-1">
                            <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-md bg-secondary px-3 py-2 text-sm">
                                {message.content}
                            </div>
                            <VersionSwitcher
                                message={message}
                                allMessages={allMessages}
                                disabled={busy}
                                onShowVersion={onShowVersion}
                            />
                        </div>
                    )}
                </li>
            ))}
        </ol>
    );
}

/** One of the model's replies, by its run state: waiting, failed (with Retry) or complete. */
export function Reply({
    message,
    canRegenerate,
    onRetry,
    onRegenerate,
    showText = true,
    versions,
}: {
    message: ChatMessage;
    canRegenerate: boolean;
    onRetry: () => void;
    onRegenerate: () => void;
    /** False where the text is shown elsewhere (a completion's document). */
    showText?: boolean;
    /** The reply's version switcher, shown with its outcome. */
    versions?: ReactNode;
}) {
    const run = replyRun(message);
    if (run?.status === "pending") {
        return (
            <p className="text-sm text-muted-foreground" aria-live="polite">
                Waiting for the reply…
            </p>
        );
    }
    if (run?.status === "error") {
        return (
            <div role="alert" className="flex items-start justify-between gap-3 text-sm">
                <p className="min-w-0 break-words text-destructive">
                    {run.error ?? "The reply failed."}
                </p>
                <div className="flex shrink-0 items-center gap-1">
                    {versions}
                    <Button variant="outline" size="sm" onClick={onRetry}>
                        Retry
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-1.5">
            {showText && (
                <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {message.content}
                </div>
            )}
            {run && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {versions}
                    <span className="font-mono">{splitRepo(run.model).label}</span>
                    {run.nTokens !== undefined && (
                        <span className="tabular-nums">
                            · {run.nTokens} {run.nTokens === 1 ? "token" : "tokens"}
                        </span>
                    )}
                    {run.finishReason === "length" && (
                        <span>· stopped at the {run.params.maxNewTokens}-token limit</span>
                    )}
                    {canRegenerate && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 text-muted-foreground/60 hover:text-foreground"
                            onClick={onRegenerate}
                            aria-label="Regenerate the reply"
                            title="Regenerate"
                        >
                            <RotateCcw className="size-3.5" />
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
