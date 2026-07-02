"use client";

import { MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChat } from "@/stores/useChat";
import { ChatPanel } from "./ChatPanel";
import { useChatController } from "./useChatController";

/**
 * Desktop chat rail. Collapsed to a slim strip by default so it stays out of
 * the way; expands into a full chat panel. The controller is mounted whether or
 * not the panel is expanded, so spin-out seeds and in-flight generations keep
 * working even while collapsed.
 */
export function ChatRail() {
    const open = useChat((s) => s.open);
    const setOpen = useChat((s) => s.setOpen);
    const controller = useChatController();

    if (!open) {
        return (
            <div className="h-full pb-3 pr-3 flex">
                <div className="w-11 h-full rounded dark:bg-secondary/50 bg-secondary/80 border flex flex-col items-center py-2 gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setOpen(true)}
                        className="h-7 w-7 hover:bg-muted"
                        aria-label="Open chat"
                        title="Open chat"
                        data-testid="chat-open-button"
                    >
                        {controller.isGenerating ? (
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        ) : (
                            <MessageSquare className="h-4 w-4" />
                        )}
                    </Button>
                    {controller.messages.length > 0 && !controller.isGenerating && (
                        <span
                            aria-hidden
                            className="h-1.5 w-1.5 rounded-full bg-primary/60"
                            title={`${controller.messages.length} messages`}
                        />
                    )}
                    <span className="mt-1 text-xs text-muted-foreground [writing-mode:vertical-lr] rotate-180 select-none">
                        Chat
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full pb-3 pr-3">
            <div
                data-testid="chat-panel"
                className="w-[340px] xl:w-[380px] h-full rounded dark:bg-secondary/50 bg-secondary/80 border overflow-hidden"
            >
                <ChatPanel controller={controller} onCollapse={() => setOpen(false)} />
            </div>
        </div>
    );
}
