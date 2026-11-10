"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

import { ModelControl } from "@/components/ModelControl";
import type { ChatMessage } from "@/db/schema";
import { chatTitleFrom, draftMessage } from "@/lib/chats";
import {
    DEFAULT_CHAT_NAME,
    DEFAULT_GENERATION_PARAMS,
    type ChatDraft,
    type ScreenRect,
} from "@/types/chats";
import { ChatColumns } from "../../chat/[chatId]/components/ChatColumns";
import { ChatComposer } from "../../chat/[chatId]/components/ChatComposer";
import { ChatThread } from "../../chat/[chatId]/components/ChatThread";
import { CompletionDocument } from "../../chat/[chatId]/components/CompletionDocument";
import { PendingItemHeader } from "./PendingItemHeader";

/** How long the composer takes to glide into place; a launch shows this page at least that long. */
export const CHAT_GLIDE_MS = 350;

const noop = () => {};

/**
 * The page of a chat that is being started from a composer outside it, shown
 * from the moment it's sent until the chat's own page opens (`usePendingItem`,
 * and `/new`): the chat page's header and body (`ChatColumns`) holding the
 * first message and its pending reply, as the chat's page will show them, so
 * that page opens in its place unchanged. The first message rises in, and the
 * composer settles into place from the composer that sent it (`composerRect`),
 * focused but taking no input until the chat exists.
 */
export function PendingChatPage({ chat }: { chat: ChatDraft }) {
    const composerRef = useRef<HTMLFormElement>(null);
    useGlideFrom(composerRef, chat.composerRect);
    const messages = draftTurn(chat);
    const Thread = chat.mode === "chat" ? ChatThread : CompletionDocument;

    return (
        <div className="aurora-base flex size-full min-h-0 flex-col" aria-busy="true">
            <span role="status" className="sr-only">
                Starting the chat…
            </span>
            <PendingItemHeader
                start={<ModelControl compact />}
                workspaceId={chat.workspaceId}
                title={chat.content ? chatTitleFrom(chat.content) : DEFAULT_CHAT_NAME}
                placeholder={!chat.content}
            />
            <div className="min-h-0 flex-1">
                <ChatColumns
                    thread={
                        <div className="duration-300 animate-in fade-in-0 slide-in-from-bottom-2">
                            <Thread
                                messages={messages}
                                allMessages={messages}
                                model={chat.model}
                                busy
                                onRetry={noop}
                                onRegenerate={noop}
                                onShowVersion={noop}
                            />
                        </div>
                    }
                    composer={
                        <ChatComposer
                            mode={chat.mode}
                            params={DEFAULT_GENERATION_PARAMS}
                            disabled={false}
                            busy
                            canContinue={false}
                            autoFocus
                            readOnly
                            modeLocked={!!chat.content}
                            formRef={composerRef}
                            onSubmit={async () => {}}
                            onModeChange={noop}
                            onParamsChange={noop}
                        />
                    }
                />
            </div>
        </div>
    );
}

/** The first message and its pending reply, as the chat's page will show them; none without a message. */
function draftTurn(chat: ChatDraft): ChatMessage[] {
    if (!chat.content) return [];
    const chatId = "pending";
    return [
        draftMessage(chatId, {
            id: "pending-message",
            parentId: null,
            content: chat.content,
            position: 0,
            data: { role: "user" },
        }),
        draftMessage(chatId, {
            id: "pending-reply",
            parentId: "pending-message",
            content: "",
            position: 1,
            data: {
                role: "assistant",
                run: { status: "pending", model: chat.model, params: DEFAULT_GENERATION_PARAMS },
            },
        }),
    ];
}

/**
 * Turns the box in `ref` into its place from `from`, where the composer that
 * started the chat was: its outline moves and resizes from that box's to its
 * own, so the box the user typed in reads as settling down into the chat's
 * smaller one, its Send staying in the corner. The content isn't scaled; the
 * box keeps its bottom edge in the page's flow, so it grows upward. Nothing
 * moves without `from`, or for a user who asks for reduced motion.
 */
function useGlideFrom(ref: RefObject<HTMLElement | null>, from: ScreenRect | undefined) {
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || !from || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const to = el.getBoundingClientRect();
        const dx = from.left - to.left;
        const dy = from.top + from.height - to.bottom;
        const glide = el.animate(
            [
                {
                    transform: `translate(${dx}px, ${dy}px)`,
                    width: `${from.width}px`,
                    height: `${from.height}px`,
                },
                { transform: "none", width: `${to.width}px`, height: `${to.height}px` },
            ],
            { duration: CHAT_GLIDE_MS, easing: "cubic-bezier(0.2, 0, 0, 1)" },
        );
        return () => glide.cancel();
    }, [ref, from]);
}
