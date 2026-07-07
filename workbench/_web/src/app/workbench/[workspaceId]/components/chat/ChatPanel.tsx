"use client";

import { useEffect, useRef } from "react";
import { MessageSquare, PanelRightClose, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatComposer } from "./ChatComposer";
import { ChatMessageItem } from "./ChatMessageItem";
import type { ChatController } from "./useChatController";

interface ChatPanelProps {
    controller: ChatController;
    /** Rendered as the header collapse/close affordance (rail collapse on
     * desktop, drawer close on mobile). Omitted → no button. */
    onCollapse?: () => void;
    collapseIcon?: React.ReactNode;
    collapseLabel?: string;
}

/**
 * The full chat surface: header, scrollable transcript, and the composer.
 * Presentational — all state comes from the passed `controller`. Shared by the
 * desktop rail and the mobile drawer.
 */
export function ChatPanel({
    controller,
    onCollapse,
    collapseIcon,
    collapseLabel = "Collapse chat",
}: ChatPanelProps) {
    const {
        messages,
        draft,
        setDraft,
        maxNewTokens,
        setMaxNewTokens,
        modelAvailable,
        isGenerating,
        send,
        clear,
        removeMessage,
        sendToTool,
    } = controller;

    const scrollRef = useRef<HTMLDivElement>(null);

    // Keep the newest turn in view as generation streams in and completes.
    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages]);

    return (
        <div className="flex h-full flex-col min-h-0">
            <div className="p-3 border-b flex items-center justify-between">
                <h2 className="text-sm pl-2 font-medium flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary/70" />
                    Chat
                </h2>
                <div className="flex items-center gap-1">
                    {messages.length > 0 && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
                            onClick={clear}
                            aria-label="Clear chat history"
                            title="Clear chat history"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    )}
                    {onCollapse && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
                            onClick={onCollapse}
                            aria-label={collapseLabel}
                            title={collapseLabel}
                        >
                            {collapseIcon ?? <PanelRightClose className="h-3.5 w-3.5" />}
                        </Button>
                    )}
                </div>
            </div>

            <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto p-3 flex flex-col gap-2">
                {messages.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4 py-8">
                        <MessageSquare className="h-6 w-6 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">
                            Prompt the active model and generate a continuation.
                        </p>
                        <p className="text-xs text-muted-foreground/70">
                            Spin a prompt out from a tool, or send a result back into the Logit
                            Lens.
                        </p>
                    </div>
                ) : (
                    messages.map((message) => (
                        <ChatMessageItem
                            key={message.id}
                            message={message}
                            onSendToTool={sendToTool}
                            onRemove={removeMessage}
                        />
                    ))
                )}
            </div>

            {!modelAvailable && (
                <p className="px-3 py-2 text-xs text-muted-foreground border-t bg-muted/30">
                    Select a model in the header to start chatting.
                </p>
            )}

            <ChatComposer
                draft={draft}
                onDraftChange={setDraft}
                onSend={() => send()}
                maxNewTokens={maxNewTokens}
                onMaxNewTokensChange={setMaxNewTokens}
                disabled={!modelAvailable}
                isGenerating={isGenerating}
            />
        </div>
    );
}
