"use client";

import { useCallback, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Send } from "lucide-react";
import { MIN_MAX_NEW_TOKENS, MAX_MAX_NEW_TOKENS } from "@/stores/useChat";

interface ChatComposerProps {
    draft: string;
    onDraftChange: (text: string) => void;
    onSend: () => void;
    maxNewTokens: number;
    onMaxNewTokensChange: (n: number) => void;
    disabled?: boolean;
    isGenerating?: boolean;
}

/**
 * Prompt composer for the chat rail. Submit is ⌘/Ctrl+Enter (plain Enter is a
 * newline), matching the other prompt inputs in the app.
 */
export function ChatComposer({
    draft,
    onDraftChange,
    onSend,
    maxNewTokens,
    onMaxNewTokensChange,
    disabled = false,
    isGenerating = false,
}: ChatComposerProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                if (!disabled && draft.trim()) onSend();
            }
        },
        [disabled, draft, onSend],
    );

    return (
        <div className="border-t p-3 flex flex-col gap-2">
            <Textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message the model…"
                aria-label="Chat prompt"
                disabled={disabled}
                className="w-full !text-sm bg-input/30 min-h-20 max-h-48 !leading-5 resize-none"
            />
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Label htmlFor="chat-max-tokens" className="text-xs text-muted-foreground">
                        Tokens
                    </Label>
                    <Input
                        id="chat-max-tokens"
                        type="number"
                        min={MIN_MAX_NEW_TOKENS}
                        max={MAX_MAX_NEW_TOKENS}
                        value={maxNewTokens}
                        onChange={(e) => onMaxNewTokensChange(Number(e.target.value))}
                        disabled={disabled}
                        aria-label="Max new tokens"
                        className="h-8 w-16 text-sm tabular-nums"
                    />
                </div>
                <Button
                    type="button"
                    size="sm"
                    onClick={onSend}
                    disabled={disabled || !draft.trim()}
                    className="gap-1.5"
                >
                    {isGenerating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Send className="h-4 w-4" />
                    )}
                    Send
                </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
                <kbd className="px-1 py-0.5 bg-muted rounded text-xs">⌘</kbd> +{" "}
                <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Enter</kbd> to send
            </p>
        </div>
    );
}
