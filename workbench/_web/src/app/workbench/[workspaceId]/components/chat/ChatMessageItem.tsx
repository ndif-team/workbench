"use client";

import { Loader2, Layers, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PatchLensIcon } from "@/components/PatchLensIcon";
import { cn } from "@/lib/utils";
import type { ChatMessage, ChatInjectTarget } from "@/stores/useChat";

interface ChatMessageItemProps {
    message: ChatMessage;
    onSendToTool: (target: ChatInjectTarget, text: string) => void;
    onRemove: (id: string) => void;
}

/**
 * A single chat turn: the user's prompt followed by the model's generated
 * continuation. The full text (prompt + continuation) can be captured back
 * into the Logit Lens / Patch Lens tools.
 */
export function ChatMessageItem({ message, onSendToTool, onRemove }: ChatMessageItemProps) {
    const { prompt, completion, status } = message;
    // The backend returns the full completion (prompt + continuation); split it
    // so the generated part can be visually distinguished from the input.
    const continuation =
        completion && completion.startsWith(prompt) ? completion.slice(prompt.length) : completion;
    const captureText = completion || prompt;

    return (
        <div className="group rounded border bg-background/60 p-2.5 flex flex-col gap-2">
            <div
                className="text-sm font-mono whitespace-pre-wrap break-words leading-5"
                aria-live="polite"
            >
                <span className="text-muted-foreground">{prompt}</span>
                {status === "done" && <span className="text-foreground">{continuation}</span>}
            </div>

            {status === "pending" && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generating…
                </div>
            )}

            {status === "error" && (
                <div className="flex items-start gap-1.5 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span className="break-words">{message.error || "Generation failed."}</span>
                </div>
            )}

            <div
                className={cn(
                    "flex items-center gap-1",
                    status === "done" ? "opacity-100" : "opacity-60",
                )}
            >
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                    disabled={status !== "done"}
                    onClick={() => onSendToTool("lens2", captureText)}
                    title="Analyze this text in the Logit Lens"
                >
                    <Layers className="h-3.5 w-3.5" />
                    Logit Lens
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                    disabled={status !== "done"}
                    onClick={() => onSendToTool("patch-lens", captureText)}
                    title="Send this text to Patch Lens"
                >
                    <PatchLensIcon className="h-3.5 w-3.5" />
                    Patch Lens
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-6 w-6 text-muted-foreground/50 hover:text-foreground"
                    onClick={() => onRemove(message.id)}
                    aria-label="Remove message"
                    title="Remove message"
                >
                    <X className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    );
}
