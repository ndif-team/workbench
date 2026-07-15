"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Play } from "lucide-react";
import { useLens2 } from "@/lib/api/lensApi";
import { useUpdateChartConfig } from "@/lib/api/configApi";
import { Lens2ConfigData } from "@/types/lens2";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { encodeText } from "@/actions/tok";
import { TokenizerLoadError } from "@/actions/errors";
import { Token } from "@/types/models";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { lens2ConfigEqualsExceptModel, tokenTextSequencesEqual } from "@/lib/configModelDiff";
import { useDraftModel } from "@/hooks/useDraftModel";
import { useBlurTokenizeScheduler } from "@/hooks/useBlurTokenizeScheduler";
import { useBackgroundTokenPair } from "@/hooks/useBackgroundTokenPair";
import { ToolPanelHeader } from "@/app/workbench/[workspaceId]/components/ToolPanelHeader";
import { useCapture } from "@/lib/analytics";

interface Lens2Config {
    id: string;
    data: Lens2ConfigData;
    type: string;
}

interface Lens2ControlsProps {
    initialConfig: Lens2Config;
    selectedModel: string;
    modelsAvailable: boolean;
    /** True while the models query is in flight. Used to suppress the
     * "unavailable" banner during a fetch — even if the previous state was
     * an error. */
    modelsLoading?: boolean;
    hasExistingData?: boolean;
}

const TOKEN_STYLES = {
    base: "!text-sm !leading-5 whitespace-pre-wrap break-words select-none !box-border relative",
    hover: "hover:bg-primary/20 hover:ring-1 hover:ring-primary/30 hover:ring-inset",
} as const;

const fixTokenText = (text: string) => {
    const numNewlines = (text.match(/\n/g) || []).length;
    const result = text
        .replace(/\r\n/g, "\\r\\n")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
    return { result, numNewlines };
};

function TokenDisplay({ tokens, loading }: { tokens: Token[]; loading: boolean }) {
    return (
        <div className="w-full custom-scrollbar select-none whitespace-pre-wrap break-words">
            {tokens.map((token, idx) => {
                const { result, numNewlines } = fixTokenText(token.text);
                return (
                    <span key={`token-${idx}`}>
                        <span
                            data-token-id={idx}
                            className={cn(
                                TOKEN_STYLES.base,
                                "bg-transparent",
                                !loading && TOKEN_STYLES.hover,
                                token.text === "\\n" ? "w-full" : "w-fit",
                                loading ? "cursor-progress" : "cursor-default",
                            )}
                        >
                            {result}
                        </span>
                        {numNewlines > 0 && "\n".repeat(numNewlines)}
                    </span>
                );
            })}
        </div>
    );
}

export function Lens2Controls({
    initialConfig,
    selectedModel,
    modelsAvailable,
    modelsLoading = false,
    hasExistingData = false,
}: Lens2ControlsProps) {
    const { workspaceId, chartId } = useParams<{ workspaceId: string; chartId: string }>();
    const capture = useCapture();

    const openedRef = useRef(false);
    useEffect(() => {
        if (openedRef.current) return;
        openedRef.current = true;
        capture("tool_opened", { tool: "lens2" });
    }, [capture]);

    const savedPrompt = initialConfig.data?.prompt || "";
    const savedTopk = initialConfig.data?.topk ?? 5;
    const savedIncludeEntropy = initialConfig.data?.includeEntropy ?? true;
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

    const { mutateAsync: computeLens2, isPending: isComputing } = useLens2();
    const { mutateAsync: updateConfig, isPending: isUpdatingConfig } = useUpdateChartConfig();

    const isExecuting = isComputing || isUpdatingConfig;
    const interactive = modelsAvailable && !isExecuting;

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
        const autoRunLens2 = async () => {
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
                const config: Lens2ConfigData = {
                    model: selectedModel,
                    prompt: trimmedPrompt,
                    topk: savedTopk,
                    includeEntropy: savedIncludeEntropy,
                };
                capture("run_submitted", {
                    tool: "lens2",
                    model: selectedModel,
                    prompt_length: trimmedPrompt.length,
                    topk: savedTopk,
                    include_entropy: savedIncludeEntropy,
                    auto: true,
                });
                await computeLens2({
                    lensRequest: { completion: config, chartId },
                    configId: initialConfig.id,
                });
                if (isCancelled) return;
                capture("run_completed", { tool: "lens2", model: selectedModel });
                await updateConfig({
                    configId: initialConfig.id,
                    chartId,
                    config: { data: config, workspaceId, type: "lens2" },
                });
                if (isCancelled) return;
                lastSyncedPromptRef.current = trimmedPrompt;
            } catch (err) {
                /* one-shot auto-run; swallow, but record the failure */
                if (!isCancelled) capture("run_failed", { tool: "lens2", error: String(err) });
            }
        };
        const timer = setTimeout(autoRunLens2, 800);
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
        computeLens2,
        updateConfig,
        capture,
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

        const config: Lens2ConfigData = {
            model: selectedModel,
            prompt: trimmedPrompt,
            topk,
            includeEntropy,
        };

        capture("run_submitted", {
            tool: "lens2",
            model: selectedModel,
            prompt_length: trimmedPrompt.length,
            topk,
            include_entropy: includeEntropy,
            auto: false,
        });
        try {
            await computeLens2({
                lensRequest: { completion: config, chartId },
                configId: initialConfig.id,
            });
            capture("run_completed", { tool: "lens2", model: selectedModel });
        } catch (err) {
            capture("run_failed", { tool: "lens2", error: String(err) });
            throw err;
        }
        await updateConfig({
            configId: initialConfig.id,
            chartId,
            config: { data: config, workspaceId, type: "lens2" },
        });
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
        computeLens2,
        updateConfig,
        capture,
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
            lens2ConfigEqualsExceptModel(initialConfig.data, {
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

    return (
        <>
            <ToolPanelHeader
                title="Logit Lens"
                viewMode={viewMode}
                showReset={showReset}
                showSync={showSync}
                isExecuting={isExecuting}
                onReset={resetDraft}
                onSync={updateConfigModel}
            />
            <div className="p-3 flex-1 overflow-auto flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                    <Label className="text-sm font-medium">Prompt</Label>
                    <div className="relative">
                        {editingText ? (
                            <Textarea
                                ref={textareaRef}
                                value={prompt}
                                onChange={(e) => {
                                    handlePromptChange(e);
                                    autoResizeTextarea();
                                }}
                                onKeyDown={handleKeyDown}
                                onBlur={handleTextareaBlur}
                                className="w-full !text-sm bg-input/30 min-h-32 !leading-5"
                                placeholder="Enter your prompt here..."
                                disabled={!interactive}
                            />
                        ) : (
                            <div
                                ref={tokenContainerRef}
                                className={cn(
                                    "flex w-full px-3 py-2 bg-input/30 border rounded min-h-32",
                                    isExecuting ? "cursor-progress" : "cursor-text",
                                )}
                                onClick={() => {
                                    if (interactive) escapeTokenArea();
                                }}
                            >
                                <TokenDisplay tokens={tokenData} loading={isExecuting} />
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="topk" className="text-sm font-medium">
                            Top-K Predictions
                        </Label>
                        <span className="text-sm text-muted-foreground">{topk}</span>
                    </div>
                    <Slider
                        id="topk"
                        min={1}
                        max={10}
                        step={1}
                        value={[topk]}
                        onValueChange={([value]) => {
                            setTopk(value);
                            capture("param_changed", {
                                tool: "lens2",
                                param: "topk",
                                value,
                            });
                        }}
                        disabled={!interactive}
                        className="w-full"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <Checkbox
                        id="entropy"
                        checked={includeEntropy}
                        onCheckedChange={(checked) => {
                            setIncludeEntropy(checked === true);
                            capture("param_changed", {
                                tool: "lens2",
                                param: "include_entropy",
                                value: checked === true,
                            });
                        }}
                        disabled={!interactive}
                    />
                    <Label htmlFor="entropy" className="text-sm font-medium cursor-pointer">
                        Include Entropy
                    </Label>
                </div>

                <Button
                    onClick={handleSubmit}
                    disabled={!interactive || !prompt.trim() || !tokensInSync}
                    className="w-full"
                >
                    {isExecuting ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Computing...
                        </>
                    ) : (
                        <>
                            <Play className="mr-2 h-4 w-4" />
                            Run Logit Lens
                        </>
                    )}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                    <kbd className="px-1 py-0.5 bg-muted rounded text-xs">⌘</kbd> +{" "}
                    <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Enter</kbd> to run
                </p>
            </div>
        </>
    );
}
