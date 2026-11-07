"use client";

import { useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";

import {
    isReplyRunning,
    markReplyInterrupted,
    useChat,
    useChatMessages,
    useRerunReply,
    useSendChatMessage,
    useShowBranch,
    useUpdateChat,
} from "@/lib/api/chatApi";
import { useCapture } from "@/lib/analytics";
import { useModelsQuery } from "@/lib/api/modelsApi";
import { branchTo, chatModeFor, isPendingReply, replyStatus } from "@/lib/chats";
import { useWorkspace } from "@/stores/useWorkspace";
import { DEFAULT_GENERATION_PARAMS } from "@/types/chats";
import { ChatComposer } from "./ChatComposer";
import { ChatThread } from "./ChatThread";
import { CompletionDocument } from "./CompletionDocument";

/**
 * The chat page's container: loads the chat and its messages, keeps the
 * header's model picker and the chat's model in step, and sends messages.
 *
 * The header's pick follows the chat when it opens; picking another model
 * there afterwards switches the chat to it, in the mode that model runs in
 * (`chatModeFor`). A reply left pending by a closed or reloaded page is
 * marked interrupted when the chat opens, so it offers Retry.
 */
export function ChatArea() {
    const { chatId } = useParams<{ chatId: string }>();
    const queryClient = useQueryClient();
    const { data: chat } = useChat(chatId);
    const { data: messages, isSuccess: messagesLoaded } = useChatMessages(chatId);
    const { data: models } = useModelsQuery();
    const { selectedModel, setSelectedModel } = useWorkspace();
    const { mutate: updateChat } = useUpdateChat();
    const { mutateAsync: send } = useSendChatMessage(chat);
    const { mutate: rerun } = useRerunReply(chat);
    const { mutate: showBranch, isPending: switching } = useShowBranch();
    const replying = useIsMutating({ mutationKey: ["chat-reply", chatId] }) > 0;
    const capture = useCapture();

    const openedRef = useRef(false);
    useEffect(() => {
        if (openedRef.current) return;
        openedRef.current = true;
        capture("tool_opened", { tool: "chat" });
    }, [capture]);

    const syncedChatRef = useRef<string | null>(null);
    useEffect(() => {
        if (!chat) return;
        if (syncedChatRef.current !== chat.id) {
            syncedChatRef.current = chat.id;
            setSelectedModel(chat.model);
            return;
        }
        if (selectedModel && selectedModel !== chat.model) {
            const model = models?.find((m) => m.name === selectedModel);
            updateChat({
                chatId: chat.id,
                settings: { model: selectedModel, mode: chatModeFor(model) },
            });
        }
    }, [chat, models, selectedModel, setSelectedModel, updateChat]);

    const checkedChatRef = useRef<string | null>(null);
    useEffect(() => {
        if (!messagesLoaded || checkedChatRef.current === chatId) return;
        checkedChatRef.current = chatId;
        for (const message of messages ?? []) {
            if (isPendingReply(message) && !isReplyRunning(message.id)) {
                markReplyInterrupted(queryClient, message);
            }
        }
    }, [chatId, messages, messagesLoaded, queryClient]);

    const scrollRef = useRef<HTMLDivElement>(null);
    const all = messages ?? [];
    const branch = branchTo(all, chat?.headMessageId);
    const last = branch[branch.length - 1];
    const lastStatus = last && replyStatus(last);
    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, [last?.id, last?.content, lastStatus]);

    const busy = replying || switching || all.some(isPendingReply);
    const mode = chat?.mode ?? "chat";
    const Thread = mode === "chat" ? ChatThread : CompletionDocument;

    return (
        <div className="flex size-full min-h-0 flex-col">
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-3xl px-4 py-6">
                    {chat && messagesLoaded && (
                        <Thread
                            messages={branch}
                            allMessages={all}
                            model={chat.model}
                            busy={busy}
                            onRetry={(reply) => rerun({ reply, trigger: "retry" })}
                            onRegenerate={(reply) => rerun({ reply, trigger: "regenerate" })}
                            onShowVersion={(messageId) =>
                                showBranch({ chatId: chat.id, messageId })
                            }
                        />
                    )}
                </div>
            </div>
            <div className="mx-auto w-full max-w-3xl px-4 pb-4">
                <ChatComposer
                    key={chatId}
                    mode={mode}
                    params={chat?.data.params ?? DEFAULT_GENERATION_PARAMS}
                    disabled={!chat || !messagesLoaded}
                    busy={busy}
                    canContinue={branch.length > 0}
                    onSubmit={(content) => send(content)}
                    onModeChange={(next) =>
                        chat && updateChat({ chatId: chat.id, settings: { mode: next } })
                    }
                    onParamsChange={(params) =>
                        chat && updateChat({ chatId: chat.id, settings: { params } })
                    }
                />
            </div>
        </div>
    );
}
