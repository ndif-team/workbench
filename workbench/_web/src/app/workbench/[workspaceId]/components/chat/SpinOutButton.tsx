"use client";

import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChat } from "@/stores/useChat";

interface SpinOutButtonProps {
    /** Resolves the current prompt text at click time. */
    getText: () => string;
    disabled?: boolean;
    className?: string;
}

/**
 * "Spin out to chat" — pushes a tool's current prompt into the chat composer
 * and generates a continuation, so a researcher can explore how the model
 * continues a prompt and then capture the result back into a tool.
 */
export function SpinOutButton({ getText, disabled = false, className }: SpinOutButtonProps) {
    const spinOut = useChat((s) => s.spinOut);
    return (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-6 px-2 text-xs gap-1 text-muted-foreground", className)}
            disabled={disabled}
            onClick={() => {
                const text = getText().trim();
                if (text) spinOut(text);
            }}
            aria-label="Spin prompt out to chat"
            title="Send this prompt to the chat and generate a continuation"
        >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            Spin out
        </Button>
    );
}
