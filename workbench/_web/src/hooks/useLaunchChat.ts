import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { CHAT_GLIDE_MS } from "@/app/(shell)/components/shell/PendingChatPage";
import { useCreateChatWithMessage } from "@/lib/api/chatApi";
import type { ChatOrigin } from "@/lib/chatLaunch";
import { chatPath } from "@/lib/chartRoutes";
import { usePendingItem } from "@/stores/usePendingItem";
import { usePromptFocus } from "@/stores/usePromptFocus";
import { useWorkspace } from "@/stores/useWorkspace";
import type { ChatDraft } from "@/types/chats";

/**
 * Starts a chat with its first message from a composer outside it (Home's),
 * without loading `/new`. The shell shows the chat's page at once
 * (`PendingChatPage`), its composer gliding down from the one that sent it,
 * while the chat is created and its reply starts (`useCreateChatWithMessage`);
 * then the chat's page opens on the rows the creation cached, with its
 * composer focused. The page swap waits for the glide, so it never cuts the
 * glide short. A chat whose user went elsewhere meanwhile is still created
 * and answered, but not opened. `origin` names the surface, for `chat_created`.
 */
export function useLaunchChat() {
    const router = useRouter();
    const { mutateAsync: createChat } = useCreateChatWithMessage();

    return useCallback(
        (chat: ChatDraft, origin: ChatOrigin) => {
            useWorkspace.getState().setSelectedModel(chat.model);
            const launch = usePendingItem
                .getState()
                .start({ kind: "chat", chat, from: window.location.pathname });
            const glided = new Promise((resolve) => setTimeout(resolve, CHAT_GLIDE_MS));
            const created = createChat({
                request: {
                    model: chat.model,
                    mode: chat.mode,
                    workspaceId: chat.workspaceId ?? null,
                },
                content: chat.content,
                origin,
            });
            Promise.all([created, glided]).then(
                ([{ id }]) => {
                    if (usePendingItem.getState().pending?.id !== launch) return;
                    usePromptFocus.getState().request(id);
                    router.push(chatPath(id));
                },
                (err) => {
                    console.error("Failed to start the chat:", err);
                    usePendingItem.getState().clear(launch);
                    toast.error("Couldn't start the chat");
                },
            );
        },
        [router, createChat],
    );
}
