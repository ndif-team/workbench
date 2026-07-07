"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useWorkspace } from "@/stores/useWorkspace";
import { useModelsQuery, generateCompletion } from "@/lib/api/modelsApi";
import { useChat, type ChatMessage, type ChatInjectTarget } from "@/stores/useChat";
import { useCreateLens2ChartPair, useCreatePatchLensChartPair } from "@/lib/api/chartApi";
import type { Lens2ConfigData } from "@/types/lens2";

const generateId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export interface ChatController {
    workspaceId: string;
    messages: ChatMessage[];
    draft: string;
    setDraft: (text: string) => void;
    maxNewTokens: number;
    setMaxNewTokens: (n: number) => void;
    /** Model completions will run against. Empty when no model is available. */
    model: string;
    modelAvailable: boolean;
    /** True while any turn in this workspace is generating. */
    isGenerating: boolean;
    /** Send the current draft (or an explicit text) for completion. */
    send: (text?: string) => void;
    clear: () => void;
    removeMessage: (id: string) => void;
    /** Capture a message's text back into a tool (current chart if compatible,
     * otherwise a freshly created chart). */
    sendToTool: (target: ChatInjectTarget, text: string) => void;
}

/**
 * Business logic for the chat rail. Owns generation, per-workspace history, the
 * spin-out seed, and the send-to-tool handoff. Shared by the desktop rail and
 * the mobile drawer.
 */
export function useChatController(): ChatController {
    const { workspaceId } = useParams<{ workspaceId: string }>();
    const pathname = usePathname();
    const router = useRouter();

    const { selectedModelIdx } = useWorkspace();
    const { data: models } = useModelsQuery();

    const {
        maxNewTokens,
        setMaxNewTokens,
        draftByWorkspace,
        historyByWorkspace,
        setDraft: setDraftRaw,
        addMessage,
        updateMessage,
        removeMessage: removeMessageRaw,
        clearHistory,
        seed,
        consumeSeed,
        requestInjection,
    } = useChat();

    const { mutate: createLens2 } = useCreateLens2ChartPair();
    const { mutate: createPatchLens } = useCreatePatchLensChartPair();

    const model = useMemo(() => {
        if (!models || models.length === 0) return "";
        return models[selectedModelIdx]?.name ?? models[0].name;
    }, [models, selectedModelIdx]);
    const modelAvailable = !!model;

    const messages = historyByWorkspace[workspaceId] ?? [];
    const draft = draftByWorkspace[workspaceId] ?? "";
    const isGenerating = messages.some((m) => m.status === "pending");

    const setDraft = useCallback(
        (text: string) => setDraftRaw(workspaceId, text),
        [setDraftRaw, workspaceId],
    );

    const removeMessage = useCallback(
        (id: string) => removeMessageRaw(workspaceId, id),
        [removeMessageRaw, workspaceId],
    );

    const clear = useCallback(() => clearHistory(workspaceId), [clearHistory, workspaceId]);

    const send = useCallback(
        (textArg?: string) => {
            const text = (textArg ?? draftByWorkspace[workspaceId] ?? "").trim();
            if (!text) return;
            const id = generateId();
            const turnModel = model;
            const turnTokens = maxNewTokens;
            addMessage(workspaceId, {
                id,
                prompt: text,
                completion: "",
                model: turnModel,
                maxNewTokens: turnTokens,
                status: "pending",
                createdAt: Date.now(),
            });
            setDraftRaw(workspaceId, "");

            if (!turnModel) {
                updateMessage(workspaceId, id, {
                    status: "error",
                    error: "No model selected. Pick a model from the header, then try again.",
                });
                return;
            }

            generateCompletion({ prompt: text, max_new_tokens: turnTokens, model: turnModel })
                .then((res) => {
                    const completion = res.completion.map((tok) => tok.text).join("");
                    updateMessage(workspaceId, id, {
                        completion: completion || text,
                        status: "done",
                    });
                })
                .catch((err) => {
                    updateMessage(workspaceId, id, {
                        status: "error",
                        error: err instanceof Error ? err.message : String(err),
                    });
                });
        },
        [
            draftByWorkspace,
            workspaceId,
            model,
            maxNewTokens,
            addMessage,
            updateMessage,
            setDraftRaw,
        ],
    );

    const sendToTool = useCallback(
        (target: ChatInjectTarget, text: string) => {
            const trimmed = text.trim();
            if (!trimmed || !workspaceId) return;

            const onLens2Route = !!pathname && pathname.includes(`/lens2/`);
            const onPatchLensRoute = !!pathname && pathname.includes(`/patch-lens/`);

            if (target === "lens2") {
                if (onLens2Route) {
                    requestInjection("lens2", trimmed);
                    return;
                }
                const config: Lens2ConfigData = {
                    prompt: trimmed,
                    model: model || "",
                    topk: 5,
                    includeEntropy: true,
                };
                createLens2(
                    { workspaceId, config },
                    {
                        onSuccess: ({ chart }) =>
                            router.push(`/workbench/${workspaceId}/lens2/${chart.id}`),
                    },
                );
                return;
            }

            // target === "patch-lens"
            if (onPatchLensRoute) {
                requestInjection("patch-lens", trimmed);
                return;
            }
            createPatchLens(
                { workspaceId },
                {
                    onSuccess: ({ chart }) => {
                        // The new page consumes this once it mounts.
                        requestInjection("patch-lens", trimmed);
                        router.push(`/workbench/${workspaceId}/patch-lens/${chart.id}`);
                    },
                },
            );
        },
        [workspaceId, pathname, model, requestInjection, createLens2, createPatchLens, router],
    );

    // Consume a spin-out seed: prefill the composer and (optionally) fire a
    // generation immediately so the user "sees up to N tokens" without a
    // second click. Guarded by nonce so it runs exactly once per spin-out.
    const seedNonceRef = useRef(0);
    useEffect(() => {
        if (!seed || seed.nonce === seedNonceRef.current) return;
        seedNonceRef.current = seed.nonce;
        const text = seed.text.trim();
        setDraftRaw(workspaceId, text);
        const shouldRun = seed.autoRun;
        consumeSeed();
        if (shouldRun && text) send(text);
    }, [seed, workspaceId, setDraftRaw, consumeSeed, send]);

    return {
        workspaceId,
        messages,
        draft,
        setDraft,
        maxNewTokens,
        setMaxNewTokens,
        model,
        modelAvailable,
        isGenerating,
        send,
        clear,
        removeMessage,
        sendToTool,
    };
}
