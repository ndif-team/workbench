"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import { useScopedWorkspaceId } from "@/components/providers/WorkspaceScopeProvider";
import { ToolRunButton } from "@/app/(shell)/components/ToolRunButton";
import { toolMeta } from "@/app/(shell)/components/toolMeta";
import { TriangleAlert } from "lucide-react";
import { useJLens } from "@/lib/api/jlensApi";
import { useUpdateChartConfig } from "@/lib/api/configApi";
import { JLensConfigData } from "@/types/jlens";
import { encodeText } from "@/lib/tokenize";
import { TokenizerLoadError } from "@/actions/errors";
import { Token } from "@/types/models";
import { toast } from "sonner";
import { jlensConfigEqualsExceptModel, tokenTextSequencesEqual } from "@/lib/configModelDiff";
import { useDraftModel } from "@/hooks/useDraftModel";
import { useFocusNewChartPrompt } from "@/hooks/useFocusNewChartPrompt";
import { useBlurTokenizeScheduler } from "@/hooks/useBlurTokenizeScheduler";
import { useBackgroundTokenPair } from "@/hooks/useBackgroundTokenPair";
import { ToolPanelHeader } from "@/app/(shell)/components/ToolPanelHeader";
import { LensPromptEditor } from "@/app/(shell)/components/lens/LensPromptEditor";
import { LensParams } from "@/app/(shell)/components/lens/LensParams";
import { FloatingToolComposer } from "@/app/(shell)/components/FloatingToolComposer";
import { useCapture } from "@/lib/analytics";

interface JLensConfig {
    id: string;
    data: JLensConfigData;
    type: string;
}

interface JLensControlsProps {
    initialConfig: JLensConfig;
    selectedModel: string;
    modelsAvailable: boolean;
    /** True while the models query is in flight. Used to suppress the
     * "unavailable" banner during a fetch — even if the previous state was
     * an error. */
    modelsLoading?: boolean;
    hasExistingData?: boolean;
    /** "panel" is the side panel; "floating" is the phone's composer over the
     * chart (`FloatingToolComposer`). */
    layout?: "panel" | "floating";
    /** Whether the selected model supports j-lens (has a Jacobian lens). When
     * false the controls are greyed out and a banner invites picking another
     * model. Defaults to true. */
    modelSupported?: boolean;
}

export function JLensControls({
    initialConfig,
    selectedModel,
    modelsAvailable,
    modelsLoading = false,
    hasExistingData = false,
    layout = "panel",
    modelSupported = true,
}: JLensControlsProps) {
    const { chartId } = useParams<{ chartId: string }>();
    const workspaceId = useScopedWorkspaceId();
    const capture = useCapture();

    const openedRef = useRef(false);
    useEffect(() => {
        if (openedRef.current) return;
        openedRef.current = true;
        capture("tool_opened", { tool: "jlens" });
    }, [capture]);

    const savedPrompt = initialConfig.data?.prompt || "";
    const savedTopk = initialConfig.data?.topk ?? 5;
    const savedIncludeEntropy = initialConfig.data?.includeEntropy ?? false;
    const savedModel = initialConfig.data?.model ?? "";

    const [prompt, setPrompt] = useState(savedPrompt);
    const [topk, setTopk] = useState(savedTopk);
    const [includeEntropy, setIncludeEntropy] = useState(savedIncludeEntropy);
    const { draftModel, setDraftModel, restoreWorkspaceModel } = useDraftModel(
        savedModel,
        initialConfig.id,
    );

    const shouldAutoRunRef = useRef(savedPrompt.trim().length > 0 && !hasExistingData);
    const hasAutoRunRef = useRef(false);

    const [tokenData, setTokenData] = useState<Token[]>([]);
    const [editingText, setEditingText] = useState(true);
    const [tokenizedModel, setTokenizedModel] = useState<string | null>(null);

    // Tokens of the saved prompt under (saved model, selected model). Both run
    // in the background and are used only by the tokenization-differs banner.
    // They never replace the visible `tokenData` — that change is gated by the
    // banner's explicit "Update config to selected model" action.
    const {
        underSaved: savedPromptTokensUnderSavedModel,
        underSelected: savedPromptTokensUnderSelectedModel,
    } = useBackgroundTokenPair(savedPrompt, savedModel, selectedModel);

    const lastSyncedPromptRef = useRef<string>(savedPrompt);
    // The prompt that produced the current `tokenData`. Used by handleTokenize
    // to detect a real prompt edit (vs. a passive blur that just re-tokenizes
    // under a swapped model).
    const lastTokenizedPromptRef = useRef<string>("");

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const tokenContainerRef = useRef<HTMLDivElement>(null);

    const { mutateAsync: computeJLens, isPending: isComputing } = useJLens();
    const { mutateAsync: updateConfig, isPending: isUpdatingConfig } = useUpdateChartConfig();

    const isExecuting = isComputing || isUpdatingConfig;
    // An unsupported model (no Jacobian lens) makes the controls read-only, the
    // same way an unavailable/cold model does — the run can't succeed.
    const interactive = modelsAvailable && !isExecuting && modelSupported;
    useFocusNewChartPrompt(chartId, textareaRef, editingText && interactive && !prompt);

    useEffect(() => {
        const configPrompt = initialConfig.data?.prompt || "";
        if (configPrompt && configPrompt !== lastSyncedPromptRef.current) {
            setPrompt(configPrompt);
            lastSyncedPromptRef.current = configPrompt;
        }
    }, [initialConfig.data?.prompt]);

    // Auto-retokenize on selected-model change when the chart has no data
    // yet. During initial composition the user has no committed visualization
    // to protect, so swapping the global model selector should immediately
    // re-tokenize under the new model and align draftModel — otherwise the
    // Run button stays disabled and the explicit Sync action is hidden by
    // its !hasExistingData guard.
    useEffect(() => {
        if (hasExistingData) return;
        if (editingText) return; // user is mid-typing; blur will handle it
        if (!prompt || !selectedModel) return;
        if (tokenizedModel === selectedModel) return;
        let cancelled = false;
        encodeText(prompt, selectedModel)
            .then((tokens) => {
                if (cancelled || tokens.length === 0) return;
                setTokenData(tokens);
                setTokenizedModel(selectedModel);
                lastTokenizedPromptRef.current = prompt;
                setDraftModel(selectedModel);
            })
            .catch(() => {
                /* tokenizer failure — leave editor open */
            });
        return () => {
            cancelled = true;
        };
    }, [selectedModel, hasExistingData, editingText, prompt, tokenizedModel]);

    // Initial-load tokenization for the visible token view. Uses the SAVED
    // model — the one that produced the existing visualization — so switching
    // the global model selector doesn't silently re-tokenize what the user is
    // looking at. Only re-fires when the chart itself changes.
    useEffect(() => {
        const fetchTokens = async () => {
            if (!savedPrompt || !savedModel) return;
            try {
                const tokens = await encodeText(savedPrompt, savedModel);
                if (tokens.length > 0) {
                    setTokenData(tokens);
                    setTokenizedModel(savedModel);
                    setEditingText(false);
                    lastTokenizedPromptRef.current = savedPrompt;
                }
            } catch {
                /* tokenizer load failure surfaces elsewhere; keep editor open */
            }
        };
        fetchTokens();
    }, [initialConfig.id, savedPrompt, savedModel]);

    useEffect(() => {
        let isCancelled = false;
        const autoRunJLens = async () => {
            if (
                !shouldAutoRunRef.current ||
                hasAutoRunRef.current ||
                !selectedModel ||
                !modelsAvailable
            ) {
                return;
            }
            hasAutoRunRef.current = true;
            shouldAutoRunRef.current = false;
            try {
                // Same trim as handleSubmit — the auto-run path (landing page /
                // auto-run on open) is a second submit path and must not send a
                // trailing-space prompt either.
                const trimmedPrompt = savedPrompt.trim();
                const tokens = await encodeText(trimmedPrompt, selectedModel);
                if (isCancelled || tokens.length <= 1) return;
                setTokenData(tokens);
                setTokenizedModel(selectedModel);
                setEditingText(false);
                // Keep the textarea state aligned with the trimmed value so
                // tokensInSync (which compares against `prompt`) and the Run
                // button stay correct after auto-run.
                setPrompt(trimmedPrompt);
                lastTokenizedPromptRef.current = trimmedPrompt;
                const config: JLensConfigData = {
                    model: selectedModel,
                    prompt: trimmedPrompt,
                    topk: savedTopk,
                    includeEntropy: savedIncludeEntropy,
                };
                await computeJLens({
                    lensRequest: { completion: config, chartId },
                    configId: initialConfig.id,
                    trigger: "launch",
                });
                if (isCancelled) return;
                await updateConfig({
                    configId: initialConfig.id,
                    chartId,
                    config: { data: config, workspaceId, type: "jlens" },
                });
                if (isCancelled) return;
                lastSyncedPromptRef.current = trimmedPrompt;
            } catch {
                /* one-shot auto-run; the mutations toast and report their failures */
            }
        };
        const timer = setTimeout(autoRunJLens, 800);
        return () => {
            isCancelled = true;
            clearTimeout(timer);
        };
    }, [
        selectedModel,
        modelsAvailable,
        savedPrompt,
        savedTopk,
        savedIncludeEntropy,
        chartId,
        initialConfig.id,
        workspaceId,
        computeJLens,
        updateConfig,
    ]);

    const autoResizeTextarea = useCallback(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, []);

    useEffect(() => {
        if (editingText) autoResizeTextarea();
    }, [prompt, editingText, autoResizeTextarea]);

    const escapeTokenArea = useCallback(() => {
        setEditingText(true);
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                const length = textareaRef.current.value.length;
                textareaRef.current.setSelectionRange(length, length);
            }
        }, 0);
    }, []);

    const handleTokenize = useCallback(async () => {
        if (!prompt.trim()) {
            toast.error("Please enter a prompt.");
            return;
        }
        let tokens: Token[];
        try {
            tokens = await encodeText(prompt, selectedModel);
        } catch (error) {
            if (error instanceof TokenizerLoadError) {
                toast.error(
                    `Could not load tokenizer for ${selectedModel}. The model may be gated and require authentication.`,
                );
            } else {
                toast.error("Failed to tokenize prompt.");
            }
            return;
        }
        if (tokens.length <= 1) {
            toast.error("Please enter a longer prompt.");
            return;
        }
        const promptChanged = prompt !== lastTokenizedPromptRef.current;
        const modelChanged = tokenizedModel !== null && tokenizedModel !== selectedModel;
        setTokenData(tokens);
        setTokenizedModel(selectedModel);
        setEditingText(false);
        lastTokenizedPromptRef.current = prompt;
        // Editing the prompt under a different selected model implicitly
        // commits the draft to that model — same effect as the explicit
        // "Update config to selected model" action. topk/includeEntropy are
        // intentionally NOT touched here; only the Reset button resets them.
        if (promptChanged && modelChanged) {
            setDraftModel(selectedModel);
        }
    }, [prompt, selectedModel, tokenizedModel]);

    const handleSubmit = useCallback(async () => {
        // Trim surrounding whitespace: a trailing space tokenizes as its own
        // token and collapses the model's prediction onto whitespace/digits.
        const trimmedPrompt = prompt.trim();
        if (!trimmedPrompt) return;
        let tokens: Token[];
        try {
            tokens = await encodeText(trimmedPrompt, selectedModel);
        } catch (error) {
            if (error instanceof TokenizerLoadError) {
                toast.error(
                    `Could not load tokenizer for ${selectedModel}. The model may be gated and require authentication.`,
                );
            } else {
                toast.error("Failed to tokenize prompt.");
            }
            return;
        }
        if (tokens.length <= 1) {
            toast.error("Please enter a longer prompt.");
            return;
        }
        setTokenData(tokens);
        setTokenizedModel(selectedModel);
        lastTokenizedPromptRef.current = trimmedPrompt;

        const config: JLensConfigData = {
            model: selectedModel,
            prompt: trimmedPrompt,
            topk,
            includeEntropy,
        };

        try {
            await computeJLens({
                lensRequest: { completion: config, chartId },
                configId: initialConfig.id,
                trigger: "run",
            });
            await updateConfig({
                configId: initialConfig.id,
                chartId,
                config: { data: config, workspaceId, type: "jlens" },
            });
        } catch {
            // The mutations toast; a failed run must not save its config.
            return;
        }
        // Land draftModel on the model that just persisted so the banner
        // doesn't flash between the run completing and the refetch arriving.
        setDraftModel(selectedModel);
        lastSyncedPromptRef.current = trimmedPrompt;
        setEditingText(false);
    }, [
        prompt,
        topk,
        includeEntropy,
        selectedModel,
        chartId,
        initialConfig.id,
        workspaceId,
        computeJLens,
        updateConfig,
    ]);

    const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setPrompt(e.target.value);
    }, []);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
            }
        },
        [handleSubmit],
    );

    const blurTokenize = useBlurTokenizeScheduler();

    const handleTextareaBlur = useCallback(() => {
        blurTokenize.schedule(() => {
            const activeElement = document.activeElement;
            const withinTextarea = activeElement && textareaRef.current?.contains(activeElement);
            const withinToken = activeElement && tokenContainerRef.current?.contains(activeElement);
            const popoverOpen = document.querySelector("[data-radix-popper-content-wrapper]");
            if (withinTextarea || withinToken || popoverOpen) return;
            if (prompt.trim()) handleTokenize();
        });
    }, [prompt, handleTokenize, blurTokenize]);

    const resetDraft = useCallback(() => {
        blurTokenize.cancel();
        setPrompt(savedPrompt);
        setTopk(savedTopk);
        setIncludeEntropy(savedIncludeEntropy);
        setDraftModel(savedModel);
        restoreWorkspaceModel(savedModel);
        lastSyncedPromptRef.current = savedPrompt;

        // Re-tokenize the restored prompt under the saved model so the
        // visible token view matches the restored config.
        if (!savedPrompt || !savedModel) return;
        encodeText(savedPrompt, savedModel)
            .then((tokens) => {
                if (tokens.length > 0) {
                    setTokenData(tokens);
                    setTokenizedModel(savedModel);
                    setEditingText(false);
                    lastTokenizedPromptRef.current = savedPrompt;
                }
            })
            .catch(() => {
                /* user can manually retokenize */
            });
    }, [
        savedPrompt,
        savedTopk,
        savedIncludeEntropy,
        savedModel,
        blurTokenize,
        setDraftModel,
        restoreWorkspaceModel,
    ]);

    // Acknowledge "use the selected model for this chart". Local-only — the
    // DB row is unchanged until the user clicks Run. Also re-tokenizes the
    // visible prompt under the new model so the user can see the difference.
    const updateConfigModel = useCallback(() => {
        if (!selectedModel) return;
        blurTokenize.cancel();
        setDraftModel(selectedModel);
        if (!prompt) return;
        encodeText(prompt, selectedModel)
            .then((tokens) => {
                if (tokens.length > 0) {
                    setTokenData(tokens);
                    setTokenizedModel(selectedModel);
                    setEditingText(false);
                    lastTokenizedPromptRef.current = prompt;
                }
            })
            .catch(() => {
                /* user can manually retokenize */
            });
    }, [selectedModel, prompt, blurTokenize, setDraftModel]);

    // --- diff state -----------------------------------------------------------

    const draftMatchesSaved = useMemo(
        () =>
            jlensConfigEqualsExceptModel(initialConfig.data, {
                prompt,
                topk,
                includeEntropy,
            }),
        [initialConfig.data, prompt, topk, includeEntropy],
    );

    // Draft is dirty if any non-model field differs OR the draft model differs
    // from the saved model. Either way, the Unsaved-changes banner fires.
    const draftDirty = !draftMatchesSaved || draftModel !== savedModel;

    // The "use selected model?" banner is about the gap between the user's
    // current intent for this chart (draftModel) and the workspace selection.
    const modelMismatchVsConfig = modelsAvailable && !!draftModel && draftModel !== selectedModel;

    const tokenizationDiffers = useMemo(() => {
        if (!modelMismatchVsConfig) return false;
        if (!savedPromptTokensUnderSavedModel || !savedPromptTokensUnderSelectedModel) {
            return false;
        }
        return !tokenTextSequencesEqual(
            savedPromptTokensUnderSavedModel,
            savedPromptTokensUnderSelectedModel,
        );
    }, [
        modelMismatchVsConfig,
        savedPromptTokensUnderSavedModel,
        savedPromptTokensUnderSelectedModel,
    ]);

    // Title-row action visibility (see handoff §3).
    const showReset = draftDirty && hasExistingData;
    const showSync = modelMismatchVsConfig;
    const viewMode = !modelsAvailable && !modelsLoading;

    // Run is only enabled when the visible tokens (a) were produced by the
    // selected model and (b) correspond to the current prompt — i.e. there
    // are no pending edits or model swaps waiting on retokenization.
    const tokensInSync =
        tokenData.length > 0 &&
        tokenizedModel === selectedModel &&
        lastTokenizedPromptRef.current === prompt;

    const floating = layout === "floating";

    const promptEditor = (
        <LensPromptEditor
            layout={layout}
            editing={editingText}
            prompt={prompt}
            tokens={tokenData}
            loading={isExecuting}
            interactive={interactive}
            textareaRef={textareaRef}
            tokenContainerRef={tokenContainerRef}
            onChange={(e) => {
                handlePromptChange(e);
                autoResizeTextarea();
            }}
            onKeyDown={handleKeyDown}
            onBlur={handleTextareaBlur}
            onEdit={escapeTokenArea}
        />
    );

    const params = (
        <LensParams
            topk={topk}
            onTopkChange={setTopk}
            includeEntropy={includeEntropy}
            onIncludeEntropyChange={setIncludeEntropy}
            disabled={!interactive}
        />
    );

    const unsupportedNotice = !modelSupported && (
        <div
            role="status"
            className="flex items-start gap-2 rounded border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200"
        >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
                {selectedModel ? (
                    <>
                        <span className="font-medium">{selectedModel}</span> has no J-Lens (Jacobian
                        lens).
                    </>
                ) : (
                    "This model has no J-Lens (Jacobian lens)."
                )}{" "}
                Pick a model with a lens from the header to run J-Lens.
            </span>
        </div>
    );

    const actions = {
        viewMode,
        showReset,
        showSync,
        isExecuting,
        onReset: resetDraft,
        onSync: updateConfigModel,
    };

    // On a phone Run tokenizes the prompt itself (`handleSubmit`), so it doesn't
    // wait for the blur that would do it: a tap on a disabled button blurs nothing.
    if (floating) {
        return (
            <FloatingToolComposer
                title="J-Lens"
                prompt={promptEditor}
                params={params}
                notice={unsupportedNotice}
                runDisabled={!interactive || !prompt.trim()}
                onRun={handleSubmit}
                actions={actions}
            />
        );
    }

    return (
        <>
            <ToolPanelHeader title="J-Lens" reference={toolMeta("jlens")?.reference} {...actions} />
            <div className="p-3 flex-1 overflow-auto flex flex-col gap-4">
                {unsupportedNotice}
                {promptEditor}

                {params}

                <ToolRunButton
                    tool="jlens"
                    busy={isExecuting}
                    onClick={handleSubmit}
                    disabled={!interactive || !prompt.trim() || !tokensInSync}
                />

                <ToolRunButton.Shortcut />
            </div>
        </>
    );
}
