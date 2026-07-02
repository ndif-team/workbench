"use client";

import { useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChat } from "@/stores/useChat";
import { ChatPanel } from "./ChatPanel";
import { useChatController } from "./useChatController";

function MobileChatSheet({ onClose }: { onClose: () => void }) {
    const controller = useChatController();
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKeyDown);
        ref.current?.focus();
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    return (
        <>
            <div
                className="fixed inset-0 z-40 bg-black/50 animate-in fade-in duration-200"
                onClick={onClose}
            />
            <div
                ref={ref}
                role="dialog"
                aria-modal="true"
                aria-label="Chat"
                tabIndex={-1}
                data-testid="chat-panel"
                className="fixed inset-y-0 right-0 z-50 w-[85vw] max-w-sm flex flex-col animate-in slide-in-from-right duration-200 shadow-2xl border-l border-border/40 bg-gradient-to-b from-card to-background outline-none"
            >
                <ChatPanel
                    controller={controller}
                    onCollapse={onClose}
                    collapseIcon={<X className="h-3.5 w-3.5" />}
                    collapseLabel="Close chat"
                />
            </div>
        </>
    );
}

/**
 * Mobile chat entry point: a bottom-right FAB (mirroring the bottom-left
 * charts drawer) that opens a right-side slide-over. Open state is shared with
 * the desktop rail via the store so a spin-out opens whichever surface is
 * mounted.
 */
export function MobileChatDrawer() {
    const { workspaceId } = useParams<{ workspaceId: string }>();
    const open = useChat((s) => s.open);
    const setOpen = useChat((s) => s.setOpen);
    const isGenerating = useChat((s) =>
        (s.historyByWorkspace[workspaceId] ?? []).some((m) => m.status === "pending"),
    );

    return (
        <>
            <Button
                variant="outline"
                size="icon"
                aria-label="Open chat"
                onClick={() => setOpen(true)}
                data-testid="chat-open-button"
                className="fixed bottom-4 right-4 z-40 h-11 w-11 rounded-full shadow-lg bg-card border-border/60 hover:bg-accent"
            >
                <MessageSquare className="h-5 w-5" />
                {isGenerating && (
                    <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
                )}
            </Button>
            {open && <MobileChatSheet onClose={() => setOpen(false)} />}
        </>
    );
}
