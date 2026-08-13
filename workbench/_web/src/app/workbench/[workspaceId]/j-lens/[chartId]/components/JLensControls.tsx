"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Play, TriangleAlert, SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useJLens } from "@/lib/api/jlensApi";
import { useUpdateChartConfig } from "@/lib/api/configApi";
import { JLensConfigData } from "@/types/jlens";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { encodeText } from "@/actions/tok";
import { TokenizerLoadError } from "@/actions/errors";
import { Token } from "@/types/models";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { jlensConfigEqualsExceptModel, tokenTextSequencesEqual } from "@/lib/configModelDiff";
import { useDraftModel } from "@/hooks/useDraftModel";
import { useBlurTokenizeScheduler } from "@/hooks/useBlurTokenizeScheduler";
import { useBackgroundTokenPair } from "@/hooks/useBackgroundTokenPair";
import { ToolPanelHeader } from "@/app/workbench/[workspaceId]/components/ToolPanelHeader";
import { useLensRowExpansion } from "@/stores/useLensRowExpansion";

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
    /** Whether the selected model supports j-lens (has a Jacobian lens). When
     * false the controls are greyed out and a banner invites picking another
     * model. Defaults to true. */
    modelSupported?: boolean;
    /** Generated token strings from the saved run (JLensData.completion), shown
     * after the prompt tokens in the token view. Null/empty when the run was a
     * single pass over the prompt. */
    completion?: string[] | null;
    /** Prompt-token count (JLensData.input.length) — the heatmap-row offset for
     * completion tokens (completion k → row promptTokenCount + k). */
    promptTokenCount?: number;
}

// Slider ceiling for tokens-to-generate. Generation is per-step and costs a
// forward pass each, so keep the range modest for an interactive lens.
const MAX_GENERATION_TOKENS = 64;
// Default tokens-to-generate for a chart that hasn't set it yet.
const DEFAULT_GENERATION_TOKENS = 24;

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

const EMPTY_EXPANSION: number[] = [];

/**
 * A run of tokens rendered as heatmap-row expand/collapse controls. A token at
 * display index `i` maps to heatmap row `rowOffset + i`; it's "on" when that row
 * is expanded. A plain click toggles one token; press-and-drag "paints" a range
 * — the token you press on decides whether the drag expands or collapses — so
 * you can slide across several at once. Drives the heatmap's collapsed sections
 * via useLensRowExpansion.
 *
 * Both runs (prompt tokens at offset 0, generated tokens after) share this;
 * generated tokens are italic + muted to set them apart, otherwise the
 * contour/selected treatment is identical.
 */
function ExpandableTokenRun({
    texts,
    rowOffset,
    chartId,
    generated = false,
    loading = false,
}: {
    texts: string[];
    rowOffset: number;
    chartId: string;
    generated?: boolean;
    loading?: boolean;
}) {
    const expanded = useLensRowExpansion((s) => s.expanded[chartId] ?? EMPTY_EXPANSION);
    const setRow = useLensRowExpansion((s) => s.setRow);
    const toggleRow = useLensRowExpansion((s) => s.toggleRow);

    const draggingRef = useRef(false);
    const expandModeRef = useRef(true);

    // A drag can end anywhere (even off the token run), so stop painting on a
    // window-level mouseup.
    useEffect(() => {
        const stop = () => {
            draggingRef.current = false;
        };
        window.addEventListener("mouseup", stop);
        return () => window.removeEventListener("mouseup", stop);
    }, []);

    const expandedSet = useMemo(() => new Set(expanded), [expanded]);
    const rowOf = (index: number) => rowOffset + index;

    const startPaint = (index: number) => {
        // Start on a collapsed token → the drag expands; on an expanded one →
        // it collapses.
        expandModeRef.current = !expandedSet.has(rowOf(index));
        draggingRef.current = true;
        setRow(chartId, rowOf(index), expandModeRef.current);
    };
    const paintOver = (index: number) => {
        if (draggingRef.current) setRow(chartId, rowOf(index), expandModeRef.current);
    };

    return (
        // Tag the run so the token-view container ignores clicks originating here
        // (including drags that end on a different token) — they toggle heatmap
        // rows, they shouldn't switch back to editing.
        <span data-token-run onClick={(e) => e.stopPropagation()}>
            {texts.map((text, idx) => {
                const { result, numNewlines } = fixTokenText(text);
                const isExpanded = expandedSet.has(rowOf(idx));
                return (
                    <span key={`${generated ? "gen" : "tok"}-${idx}`}>
                        <span
                            role="button"
                            tabIndex={loading ? -1 : 0}
                            data-row-token
                            aria-pressed={isExpanded}
                            title={
                                isExpanded
                                    ? "Heatmap row expanded — click to collapse"
                                    : "Click or drag to expand this token's heatmap row"
                            }
                            onMouseDown={(e) => {
                                if (loading) return;
                                e.preventDefault();
                                startPaint(idx);
                            }}
                            onMouseEnter={() => {
                                if (!loading) paintOver(idx);
                            }}
                            onKeyDown={(e) => {
                                if ((e.key === "Enter" || e.key === " ") && !loading) {
                                    e.preventDefault();
                                    toggleRow(chartId, rowOf(idx));
                                }
                            }}
                            className={cn(
                                TOKEN_STYLES.base,
                                loading ? "cursor-progress" : "cursor-pointer",
                                generated && "italic text-muted-foreground",
                                isExpanded
                                    ? "bg-primary/20 ring-1 ring-inset ring-primary/40"
                                    : !loading && TOKEN_STYLES.hover,
                                text === "\\n" ? "w-full" : "w-fit",
                            )}
                        >
                            {result}
                        </span>
                        {numNewlines > 0 && "\n".repeat(numNewlines)}
                    </span>
                );
            })}
        </span>
    );
}

function TokenDisplay({
    tokens,
    completion,
    chartId,
    promptTokenCount,
    loading,
}: {
    tokens: Token[];
    /** Generated token strings from the run, rendered after the prompt tokens. */
    completion?: string[];
    /** Chart id — tokens read/write row expansion from the store. */
    chartId: string;
    /** Prompt-token count (JLensData.input.length); completion token k maps to
     * heatmap row `promptTokenCount + k`. */
    promptTokenCount: number;
    loading: boolean;
}) {
    return (
        <div className="w-full custom-scrollbar select-none whitespace-pre-wrap break-words">
            <ExpandableTokenRun
                texts={tokens.map((t) => t.text)}
                rowOffset={0}
                chartId={chartId}
                loading={loading}
            />
            {completion && completion.length > 0 && (
                <ExpandableTokenRun
                    texts={completion}
                    rowOffset={promptTokenCount}
                    chartId={chartId}
                    generated
                    loading={loading}
                />
            )}
        </div>
    );
}

export function JLensControls({
    initialConfig,
    selectedModel,
    modelsAvailable,
    modelsLoading = false,
    hasExistingData = false,
    modelSupported = true,
    completion = null,
    promptTokenCount = 0,
}: JLensControlsProps) {
    const { workspaceId, chartId } = useParams<{ workspaceId: string; chartId: string }>();

    const savedPrompt = initialConfig.data?.prompt || "";
    const savedTopk = initialConfig.data?.topk ?? 5;
    // Multi-token generation is off by default (a single prefill pass, no tokens
    // generated). Older charts predate the flag, so fall back to "was it
    // generating more than one token?". `maxNewTokens` is the length used when
    // generation is on; it always holds a valid ≥2 value even while off, so
    // enabling the toggle drops straight into a sensible default.
    const rawMaxNewTokens = initialConfig.data?.maxNewTokens;
    const savedGenerate = initialConfig.data?.generate ?? (rawMaxNewTokens ?? 1) > 1;
    const savedMaxNewTokens =
        rawMaxNewTokens && rawMaxNewTokens >= 2 ? rawMaxNewTokens : DEFAULT_GENERATION_TOKENS;
    // Sampling knobs (only used when generating). Defaults produce a gently
    // varied sample; `sample` off means greedy/deterministic decoding.
    const savedSample = initialConfig.data?.sample ?? false;
    const savedTemperature = initialConfig.data?.temperature ?? 0.7;
    const savedTopP = initialConfig.data?.topP ?? 0.95;
    const savedTopK = initialConfig.data?.topK ?? 50;
    const savedModel = initialConfig.data?.model ?? "";

    const [prompt, setPrompt] = useState(savedPrompt);
    const [topk, setTopk] = useState(savedTopk);
    const [generate, setGenerate] = useState(savedGenerate);
    const [maxNewTokens, setMaxNewTokens] = useState(savedMaxNewTokens);
    const [sample, setSample] = useState(savedSample);
    const [temperature, setTemperature] = useState(savedTemperature);
    const [topP, setTopP] = useState(savedTopP);
    const [topK, setTopK] = useState(savedTopK);

    // Generated-token row expansion lives in a transient store shared with the
    // display (CompletionTokens owns the per-token interaction); the controls
    // only need to reset it on a fresh run so the display reseeds the default.
    const resetRowExpansion = useLensRowExpansion((s) => s.reset);
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

    // Flipped synchronously at the top of handleSubmit so the Run button shows
    // progress on the same frame as the click — before the async tokenize +
    // compute round-trips, which otherwise leave the UI idle for a beat.
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isExecuting = isComputing || isUpdatingConfig || isSubmitting;
    // An unsupported model (no Jacobian lens) makes the controls read-only, the
    // same way an unavailable/cold model does — the run can't succeed.
    const interactive = modelsAvailable && !isExecuting && modelSupported;

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
                // Keep the textarea state aligned with the trimmed value so the
                // token view and the blur-retokenize check stay correct after
                // auto-run.
                setPrompt(trimmedPrompt);
                lastTokenizedPromptRef.current = trimmedPrompt;
                const config: JLensConfigData = {
                    model: selectedModel,
                    prompt: trimmedPrompt,
                    topk: savedTopk,
                    includeEntropy: true,
                    generate: savedGenerate,
                    maxNewTokens: savedMaxNewTokens,
                    sample: savedSample,
                    temperature: savedTemperature,
                    topP: savedTopP,
                    topK: savedTopK,
                };
                await computeJLens({
                    lensRequest: { completion: config, chartId },
                    configId: initialConfig.id,
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
                /* one-shot auto-run; swallow */
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
        savedGenerate,
        savedMaxNewTokens,
        savedSample,
        savedTemperature,
        savedTopP,
        savedTopK,
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
        // "Update config to selected model" action. The other draft knobs
        // (topk, generation, sampling) are intentionally NOT touched here; only
        // the Reset button resets them.
        if (promptChanged && modelChanged) {
            setDraftModel(selectedModel);
        }
    }, [prompt, selectedModel, tokenizedModel]);

    const handleSubmit = useCallback(async () => {
        // Trim surrounding whitespace: a trailing space tokenizes as its own
        // token and collapses the model's prediction onto whitespace/digits.
        const trimmedPrompt = prompt.trim();
        if (!trimmedPrompt) return;

        // Register the click on this frame so the button reflects progress
        // immediately, ahead of the async work below.
        setIsSubmitting(true);
        try {
            // Reuse the already-visible tokens when they were produced for this
            // exact prompt+model (e.g. by a prior blur or auto-run) instead of
            // paying another tokenizer round-trip.
            const canReuseTokens =
                tokenData.length > 0 &&
                tokenizedModel === selectedModel &&
                lastTokenizedPromptRef.current === trimmedPrompt;

            let tokens: Token[];
            if (canReuseTokens) {
                tokens = tokenData;
            } else {
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
            }
            if (tokens.length <= 1) {
                toast.error("Please enter a longer prompt.");
                return;
            }
            if (!canReuseTokens) {
                setTokenData(tokens);
                setTokenizedModel(selectedModel);
                lastTokenizedPromptRef.current = trimmedPrompt;
            }

            const config: JLensConfigData = {
                model: selectedModel,
                prompt: trimmedPrompt,
                topk,
                includeEntropy: true,
                generate,
                maxNewTokens,
                sample,
                temperature,
                topP,
                topK,
            };

            // A fresh run replaces the completion, so drop the row expansion (the
            // display reseeds the default once the new data lands). Do it right
            // before the mutation starts — the mutation synchronously flips
            // `isJLensRunning`, which gates the display's reseed effect so it
            // can't consume the reset against stale data.
            resetRowExpansion(chartId);
            try {
                await computeJLens({
                    lensRequest: { completion: config, chartId },
                    configId: initialConfig.id,
                });
            } catch {
                // useJLens's onError owns the toast. Stopping here both avoids
                // an unhandled rejection and keeps the config write below from
                // recording a run that never produced data.
                return;
            }
            await updateConfig({
                configId: initialConfig.id,
                chartId,
                config: { data: config, workspaceId, type: "jlens" },
            });
            // Land draftModel on the model that just persisted so the banner
            // doesn't flash between the run completing and the refetch arriving.
            setDraftModel(selectedModel);
            lastSyncedPromptRef.current = trimmedPrompt;
            setEditingText(false);
        } finally {
            setIsSubmitting(false);
        }
    }, [
        prompt,
        tokenData,
        tokenizedModel,
        topk,
        generate,
        maxNewTokens,
        sample,
        temperature,
        topP,
        topK,
        selectedModel,
        chartId,
        initialConfig.id,
        workspaceId,
        computeJLens,
        updateConfig,
        resetRowExpansion,
    ]);

    const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setPrompt(e.target.value);
    }, []);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            // Enter runs the lens; Shift+Enter inserts a newline. handleSubmit
            // tokenizes the prompt before computing, so running straight from
            // the textarea (without a prior blur/tokenize) is always safe.
            if (e.key === "Enter" && !e.shiftKey) {
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
        setGenerate(savedGenerate);
        setMaxNewTokens(savedMaxNewTokens);
        setSample(savedSample);
        setTemperature(savedTemperature);
        setTopP(savedTopP);
        setTopK(savedTopK);
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
        savedGenerate,
        savedMaxNewTokens,
        savedSample,
        savedTemperature,
        savedTopP,
        savedTopK,
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
                generate,
                maxNewTokens,
                sample,
                temperature,
                topP,
                topK,
            }),
        [initialConfig.data, prompt, topk, generate, maxNewTokens, sample, temperature, topP, topK],
    );

    // Draft is dirty if any non-model field differs OR the draft model differs
    // from the saved model. Either way, the Unsaved-changes banner fires.
    const draftDirty = !draftMatchesSaved || draftModel !== savedModel;

    // Show the run's generated tokens after the prompt in the token view, but
    // only while the displayed prompt still matches the one that produced them
    // (a pending edit makes the saved completion stale) and the token view is up.
    const visibleCompletion =
        !editingText && completion && completion.length > 0 && prompt.trim() === savedPrompt.trim()
            ? completion
            : undefined;

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

    // One-line summary shown on the generation-settings trigger under the prompt.
    // With generation off it's a single prefill pass; with it on, sampling vs
    // greedy is the other axis.
    const generationSummary = !generate
        ? "1 token"
        : `${maxNewTokens} tokens · ${sample ? "sampling" : "greedy"}`;

    return (
        <>
            <ToolPanelHeader
                title="J-Lens"
                reference={{
                    href: "https://transformer-circuits.pub/2026/workspace/index.html",
                    label: "J-Lens reference (transformer-circuits.pub)",
                }}
                viewMode={viewMode}
                showReset={showReset}
                showSync={showSync}
                isExecuting={isExecuting}
                onReset={resetDraft}
                onSync={updateConfigModel}
            />
            <div className="p-3 flex-1 overflow-auto flex flex-col gap-4">
                {!modelSupported && (
                    <div
                        role="status"
                        className="flex items-start gap-2 rounded border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200"
                    >
                        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span>
                            {selectedModel ? (
                                <>
                                    <span className="font-medium">{selectedModel}</span> has no
                                    J-Lens (Jacobian lens).
                                </>
                            ) : (
                                "This model has no J-Lens (Jacobian lens)."
                            )}{" "}
                            Pick a model with a lens from the header to run J-Lens.
                        </span>
                    </div>
                )}
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
                                onClick={(e) => {
                                    // Clicking a token is a deliberate action
                                    // (generated tokens toggle heatmap rows;
                                    // prompt tokens are just shown) — it should
                                    // not flip into prompt editing. Only a click
                                    // on the empty area of the box edits.
                                    if (
                                        (e.target as HTMLElement).closest(
                                            "[data-row-token],[data-token-run]",
                                        )
                                    )
                                        return;
                                    if (interactive) escapeTokenArea();
                                }}
                            >
                                <TokenDisplay
                                    tokens={tokenData}
                                    completion={visibleCompletion}
                                    chartId={chartId}
                                    promptTokenCount={promptTokenCount}
                                    loading={isExecuting}
                                />
                            </div>
                        )}

                        {/* Generation settings live in the prompt's bottom-right
                            corner — they shape the completion, unlike the tool
                            parameters (top-k predictions) below. The dot flags that
                            the run generates more than a single token. */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    disabled={!interactive}
                                    aria-label="Generation settings"
                                    title={`Generation · ${generationSummary}`}
                                    className="absolute bottom-2 right-2 size-7 rounded text-muted-foreground hover:text-foreground"
                                >
                                    <SlidersHorizontal className="size-4" />
                                    {generate && (
                                        <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" />
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent
                                align="end"
                                side="bottom"
                                sideOffset={8}
                                className="w-64 p-3"
                            >
                                <div className="flex flex-col gap-2.5">
                                    {/* Multi-token generation — off by default (no
                                        tokens generated); the length row is greyed
                                        until it's enabled. */}
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            id="generate"
                                            checked={generate}
                                            onCheckedChange={(checked) =>
                                                setGenerate(checked === true)
                                            }
                                            disabled={!interactive}
                                        />
                                        <Label
                                            htmlFor="generate"
                                            className="cursor-pointer text-sm font-medium"
                                        >
                                            Multi-token generation
                                        </Label>
                                    </div>
                                    <div
                                        className={cn(
                                            "flex items-center gap-2",
                                            !generate && "opacity-50",
                                        )}
                                    >
                                        <Label
                                            htmlFor="max-new-tokens"
                                            className="w-24 shrink-0 text-sm"
                                        >
                                            Tokens
                                        </Label>
                                        <Slider
                                            id="max-new-tokens"
                                            min={2}
                                            max={MAX_GENERATION_TOKENS}
                                            step={1}
                                            value={[maxNewTokens]}
                                            onValueChange={([value]) => setMaxNewTokens(value)}
                                            disabled={!interactive || !generate}
                                            className="flex-1"
                                        />
                                        <span className="w-8 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                                            {maxNewTokens}
                                        </span>
                                    </div>

                                    <Separator className="my-0.5" />

                                    {/* Sampling — its own toggle; the rows below stay
                                        visible but greyed until it's on, and only
                                        apply while generating. */}
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            id="sample"
                                            checked={sample}
                                            onCheckedChange={(checked) =>
                                                setSample(checked === true)
                                            }
                                            disabled={!interactive || !generate}
                                        />
                                        <Label
                                            htmlFor="sample"
                                            className={cn(
                                                "cursor-pointer text-sm font-medium",
                                                !generate && "opacity-50",
                                            )}
                                        >
                                            Sampling
                                        </Label>
                                        {generate && !sample && (
                                            <span className="ml-auto text-xs text-muted-foreground">
                                                greedy
                                            </span>
                                        )}
                                    </div>
                                    <div
                                        className={cn(
                                            "flex flex-col gap-2",
                                            (!generate || !sample) && "opacity-50",
                                        )}
                                    >
                                        <div className="flex items-center gap-2">
                                            <Label
                                                htmlFor="temperature"
                                                className="w-24 shrink-0 text-sm"
                                            >
                                                Temperature
                                            </Label>
                                            <Slider
                                                id="temperature"
                                                min={0.1}
                                                max={2}
                                                step={0.05}
                                                value={[temperature]}
                                                onValueChange={([value]) => setTemperature(value)}
                                                disabled={!interactive || !generate || !sample}
                                                className="flex-1"
                                            />
                                            <span className="w-8 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                                                {temperature.toFixed(2)}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Label
                                                htmlFor="top-p"
                                                className="w-24 shrink-0 text-sm"
                                            >
                                                Top-p
                                            </Label>
                                            <Slider
                                                id="top-p"
                                                min={0.05}
                                                max={1}
                                                step={0.05}
                                                value={[topP]}
                                                onValueChange={([value]) => setTopP(value)}
                                                disabled={!interactive || !generate || !sample}
                                                className="flex-1"
                                            />
                                            <span className="w-8 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                                                {topP.toFixed(2)}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Label
                                                htmlFor="sampling-top-k"
                                                className="w-24 shrink-0 text-sm"
                                            >
                                                Top-k
                                            </Label>
                                            <Slider
                                                id="sampling-top-k"
                                                min={0}
                                                max={100}
                                                step={1}
                                                value={[topK]}
                                                onValueChange={([value]) => setTopK(value)}
                                                disabled={!interactive || !generate || !sample}
                                                className="flex-1"
                                            />
                                            <span className="w-8 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                                                {topK === 0 ? "Off" : topK}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </PopoverContent>
                        </Popover>
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
                        onValueChange={([value]) => setTopk(value)}
                        disabled={!interactive}
                        className="w-full"
                    />
                </div>

                <Button
                    onClick={handleSubmit}
                    disabled={!interactive || !prompt.trim()}
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
                            Run J-Lens
                        </>
                    )}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                    <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Enter</kbd> to run ·{" "}
                    <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Shift</kbd> +{" "}
                    <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Enter</kbd> for a new line
                </p>
            </div>
        </>
    );
}
