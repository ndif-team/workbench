"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { useCreateChatWithMessage } from "@/lib/api/chatApi";
import type { ChatOrigin } from "@/lib/chatLaunch";
import { getModels } from "@/lib/api/modelsApi";
import type { ChartLaunchRequest } from "@/lib/chartLaunch";
import { chatPath } from "@/lib/chartRoutes";
import { ChatLaunch } from "@/lib/chatLaunch";
import { resumePendingRequest } from "@/lib/pendingRequest";
import { queryKeys } from "@/lib/queryKeys";
import { usePromptFocus } from "@/stores/usePromptFocus";
import { useWorkspace } from "@/stores/useWorkspace";
import { PageHeader } from "../../components/shell/PageHeader";
import { PendingChatPage } from "../../components/shell/PendingChatPage";
import { LaunchFailed } from "./LaunchFailed";

/**
 * Starts the chat a `/new?tool=Chat…` URL describes (`ChatLaunch`): creates
 * it with its first message and starts the reply, showing the chat's page
 * meanwhile (`PendingChatPage`), then replaces the URL with the chat's page,
 * its composer focused. A URL that names no mode waits for the model catalog
 * to tell it. Like `NewChartCreator`, a launch still waiting on sign-in comes
 * first, and it follows the mutation's promise, guarded against strict mode's
 * second effect run. `origin` is the surface that sent the user here.
 */
export function NewChatCreator({
    request,
    origin,
}: {
    request: ChartLaunchRequest;
    origin: ChatOrigin;
}) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { mutateAsync: createChat } = useCreateChatWithMessage();
    const [draft, setDraft] = useState(() => ChatLaunch.draft(request));
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const startedAttemptRef = useRef<number | null>(null);

    useEffect(() => {
        if (startedAttemptRef.current === attempt) return;
        startedAttemptRef.current = attempt;
        if (resumePendingRequest(router)) return;

        setFailed(false);
        const start = async () => {
            const chat =
                ChatLaunch.draft(request) ??
                ChatLaunch.draft(
                    request,
                    await queryClient.fetchQuery({
                        queryKey: queryKeys.models.all,
                        queryFn: getModels,
                    }),
                );
            if (!chat) throw new Error("No model is available to chat with");
            setDraft(chat);
            useWorkspace.getState().setSelectedModel(chat.model);
            const created = await createChat({
                request: { model: chat.model, mode: chat.mode, workspaceId: chat.workspaceId },
                content: chat.content,
                origin,
            });
            usePromptFocus.getState().request(created.id);
            router.replace(chatPath(created.id));
        };
        start().catch((err) => {
            console.error("Failed to start the chat:", err);
            setFailed(true);
        });
    }, [attempt, request, origin, router, queryClient, createChat]);

    if (failed) {
        return (
            <LaunchFailed
                message="Couldn't start the chat."
                onRetry={() => setAttempt((n) => n + 1)}
            />
        );
    }
    if (draft) return <PendingChatPage chat={draft} />;
    return (
        <div className="flex size-full min-h-0 flex-col" aria-busy="true">
            <span role="status" className="sr-only">
                Starting the chat…
            </span>
            <PageHeader />
        </div>
    );
}
