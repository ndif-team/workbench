import { splitRepo } from "@/components/model-selector/status";
import { replyStatus } from "@/lib/chats";
import { Reply, VersionSwitcher, type ThreadProps } from "./ChatThread";

/**
 * A completion-mode chat: one document, the user's text and the model's
 * continuations in order, with the model's parts tinted. The last reply's
 * state (waiting, failed, its token count) shows below the document.
 */
export function CompletionDocument({
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
                Write the start of a text for{" "}
                <span className="font-mono">{splitRepo(model).label}</span> to continue.
            </p>
        );
    }

    const last = messages[messages.length - 1];
    return (
        <div className="space-y-3">
            <div className="whitespace-pre-wrap break-words rounded-md border bg-card p-4 font-mono text-sm leading-relaxed">
                {messages.map((message) =>
                    message.data.role !== "assistant" ? (
                        <span key={message.id}>{message.content}</span>
                    ) : replyStatus(message) === "complete" ? (
                        <span key={message.id} className="rounded-sm bg-primary/10">
                            {message.content}
                        </span>
                    ) : null,
                )}
            </div>
            {last.data.role === "assistant" && (
                <Reply
                    message={last}
                    showText={false}
                    canRegenerate={!busy}
                    onRetry={() => onRetry(last)}
                    onRegenerate={() => onRegenerate(last)}
                    versions={
                        <VersionSwitcher
                            message={last}
                            allMessages={allMessages}
                            disabled={busy}
                            onShowVersion={onShowVersion}
                        />
                    }
                />
            )}
        </div>
    );
}
