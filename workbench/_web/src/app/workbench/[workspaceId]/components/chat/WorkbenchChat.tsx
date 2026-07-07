"use client";

import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ChatRail } from "./ChatRail";
import { MobileChatDrawer } from "./MobileChatDrawer";

/**
 * Workspace-wide layout wrapper that makes the Chat tool available on every
 * tool page. On desktop the chat is a collapsible right rail that shares the
 * horizontal space with the tool; on mobile it's a bottom-right FAB + drawer.
 */
export function WorkbenchChat({ children }: { children: ReactNode }) {
    const isMobile = useIsMobile();

    // Before the media query resolves, render children full-width to avoid a
    // layout flash. The rail mounts once we know the viewport.
    if (isMobile === undefined) {
        return <div className="size-full min-h-0">{children}</div>;
    }

    if (isMobile) {
        return (
            <div className="size-full min-h-0">
                {children}
                <MobileChatDrawer />
            </div>
        );
    }

    return (
        <div className="flex size-full min-h-0">
            <div className="flex-1 min-w-0 min-h-0">{children}</div>
            <ChatRail />
        </div>
    );
}
