import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { defaultModel, isModelRunnable } from "@/components/model-selector/status";
import { useCreateChat } from "@/lib/api/chatApi";
import { getModels, useModelsQuery } from "@/lib/api/modelsApi";
import { chatPath } from "@/lib/chartRoutes";
import { chatModeFor } from "@/lib/chats";
import { queryKeys } from "@/lib/queryKeys";
import { useWorkspace } from "@/stores/useWorkspace";

/**
 * Starts a chat and opens it, in `workspaceId` (else the default workspace).
 * It starts on the header's model when that is a chat model that can run,
 * else on the default chat model, so a new chat takes turns rather than
 * continuing text unless only base models can run. Picked before the model
 * list has loaded, it waits for the list.
 */
export function useStartChat() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { data: models } = useModelsQuery();
    const selectedModel = useWorkspace((s) => s.selectedModel);
    const { mutateAsync: createChat, isPending } = useCreateChat();

    const start = useCallback(
        async (workspaceId?: string | null) => {
            const all =
                models ??
                (await queryClient
                    .fetchQuery({ queryKey: queryKeys.models.all, queryFn: getModels })
                    .catch(() => []));
            const current = all.find((m) => m.name === selectedModel);
            const model =
                current?.is_chat && isModelRunnable(current)
                    ? current
                    : defaultModel(all, (m) => m.is_chat);
            if (!model) {
                toast.error("No model is available to chat with yet");
                return;
            }
            const chat = await createChat({
                model: model.name,
                mode: chatModeFor(model),
                workspaceId: workspaceId ?? null,
            });
            router.push(chatPath(chat.id));
        },
        [models, selectedModel, createChat, queryClient, router],
    );

    return { start, isPending };
}
