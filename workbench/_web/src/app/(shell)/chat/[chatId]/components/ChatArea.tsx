"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
    isReplyRunning,
    markReplyInterrupted,
    useChat,
    useChatMessages,
    useCreateChat,
    useRerunReply,
    useSendChatMessage,
    useShowBranch,
    useUpdateChat,
} from "@/lib/api/chatApi";
import { useCapture } from "@/lib/analytics";
import { useModelsQuery } from "@/lib/api/modelsApi";
import { chatPath } from "@/lib/chartRoutes";
import { branchTo, isModeLocked, isPendingReply, replyStatus, settingsForModel } from "@/lib/chats";
import { usePromptFocus } from "@/stores/usePromptFocus";
import { useWorkspace } from "@/stores/useWorkspace";
import { DEFAULT_GENERATION_PARAMS } from "@/types/chats";
import { ChatColumns } from "./ChatColumns";
import { ChatComposer } from "./ChatComposer";
import { ChatThread } from "./ChatThread";
import { CompletionDocument } from "./CompletionDocument";

/**
 * The chat page's container: loads the chat and its messages, keeps the
 * header's model picker and the chat's model in step, and sends messages.
 *
 * The header's pick follows the chat when it opens; picking another model
 * there afterwards switches the chat to it (`settingsForModel`): in that
 * model's mode until the first message, in the chat's own after it. A chat
 * with messages can't take a base model, so the pick goes back and a toast
 * offers a completion with that model instead. A reply left pending by a closed or reloaded page is
 * marked interrupted when the chat opens, so it offers Retry. A chat started
 * from Home's composer opens with its composer focused (`usePromptFocus`).
 */
export function ChatArea() {
    const { chatId } = useParams<{ chatId: string }>();
    const queryClient = useQueryClient();
    const { data: chat } = useChat(chatId);
    const { data: messages, isSuccess: messagesLoaded } = useChatMessages(chatId);
    const { data: models } = useModelsQuery();
    const { selectedModel, setSelectedModel } = useWorkspace();
    const { mutate: updateChat } = useUpdateChat();
    const { mutateAsync: createChat } = useCreateChat("chat_page");
    const router = useRouter();
    const { mutateAsync: send } = useSendChatMessage(chat);
    const { mutate: rerun } = useRerunReply(chat);
    const { mutate: showBranch } = useShowBranch();
    const replying = useIsMutating({ mutationKey: ["chat-reply", chatId] }) > 0;
    const capture = useCapture();

    const [focusComposer] = useState(() => usePromptFocus.getState().itemId === chatId);
    useEffect(() => {
        if (focusComposer) usePromptFocus.getState().clear();
    }, [focusComposer]);

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
        if (!selectedModel || selectedModel === chat.model || !models) return;
        const settings = settingsForModel(
            chat,
            selectedModel,
            models.find((m) => m.name === selectedModel),
        );
        if (settings) {
            updateChat({ chatId: chat.id, settings });
            return;
        }
        setSelectedModel(chat.model);
        const name = selectedModel.split("/").pop();
        toast(`${name} is a base model`, {
            description: `It continues text rather than taking turns, so this chat stays on ${chat.model.split("/").pop()}.`,
            action: {
                label: "Start a completion",
                onClick: () =>
                    createChat({
                        model: selectedModel,
                        mode: "completion",
                        workspaceId: chat.workspaceId,
                    }).then((created) => router.push(chatPath(created.id))),
            },
        });
    }, [chat, models, selectedModel, setSelectedModel, updateChat, createChat, router]);

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

    const busy = replying || all.some(isPendingReply);
    const mode = chat?.mode ?? "chat";
    const chatModel = models?.find((m) => m.name === chat?.model);
    const modeFixed =
        chat && isModeLocked(chat)
            ? "started"
            : chatModel && !chatModel.is_chat
              ? "base"
              : undefined;
    const Thread = mode === "chat" ? ChatThread : CompletionDocument;

    return (
        <ChatColumns
            scrollRef={scrollRef}
            thread={
                chat &&
                messagesLoaded && (
                    <Thread
                        messages={branch}
                        allMessages={all}
                        model={chat.model}
                        busy={busy}
                        onRetry={(reply) => rerun({ reply, trigger: "retry" })}
                        onRegenerate={(reply) => rerun({ reply, trigger: "regenerate" })}
                        onShowVersion={(messageId) => showBranch({ chatId: chat.id, messageId })}
                    />
                )
            }
            composer={
                <ChatComposer
                    key={chatId}
                    mode={mode}
                    params={chat?.data.params ?? DEFAULT_GENERATION_PARAMS}
                    disabled={!chat || !messagesLoaded}
                    busy={busy}
                    canContinue={branch.length > 0}
                    autoFocus={focusComposer}
                    modeFixed={modeFixed}
                    onSubmit={(content) => send(content)}
                    onModeChange={(next) =>
                        chat && updateChat({ chatId: chat.id, settings: { mode: next } })
                    }
                    onParamsChange={(params) =>
                        chat && updateChat({ chatId: chat.id, settings: { params } })
                    }
                />
            }
        />
    );
}
