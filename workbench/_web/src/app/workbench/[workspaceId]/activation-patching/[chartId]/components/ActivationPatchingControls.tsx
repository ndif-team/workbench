"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, Play, X, Snowflake, ChevronDown } from "lucide-react";
import { useActivationPatching } from "@/lib/api/activationPatchingApi";
import { useUpdateChartConfig } from "@/lib/api/configApi";
import {
    ActivationPatchingConfigData,
    ActivationPatchingData,
    SourcePosition,
} from "@/types/activationPatching";
import { encodeText } from "@/actions/tok";
import { TokenizerLoadError } from "@/actions/errors";
import { Token } from "@/types/models";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getChartById } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import {
    PATCH_COLORS,
    useActivationPatchingState,
    PatchPromptSection,
    EnhancedPatchArrows,
    useMouseFollowingArrow,
} from "@/components/activation-patching/toolkit";
import { apConfigEqualsExceptModel, tokenTextSequencesEqual } from "@/lib/configModelDiff";
import { useDraftModel } from "@/hooks/useDraftModel";
import { useBlurTokenizeScheduler } from "@/hooks/useBlurTokenizeScheduler";
import { useBackgroundTokenPair } from "@/hooks/useBackgroundTokenPair";
import { ToolPanelHeader } from "@/app/workbench/[workspaceId]/components/ToolPanelHeader";

interface ActivationPatchingConfig {
    id: string;
    data: ActivationPatchingConfigData;
    type: string;
}

interface ActivationPatchingControlsProps {
    initialConfig: ActivationPatchingConfig;
    selectedModel: string;
    modelsAvailable: boolean;
    /** True while the models query is in flight. Used to suppress the
     * "unavailable" banner during a fetch — even if the previous state was
     * an error. */
    modelsLoading?: boolean;
    hasExistingData?: boolean;
}

// Collapsible patch configuration table component
function PatchConfigTable({
    srcPos,
    tgtPos,
    tgtFreeze,
    expanded,
    onToggleExpanded,
    onClear,
    disabled,
}: {
    srcPos: SourcePosition[];
    tgtPos: number[];
    tgtFreeze: number[];
    expanded: boolean;
    onToggleExpanded: () => void;
    onClear: () => void;
    disabled: boolean;
}) {
    if (srcPos.length === 0 && tgtFreeze.length === 0) {
        return null;
    }

    return (
        <div className="border border-border/30 rounded overflow-hidden">
            {/* Header / Toggle */}
            <div className="flex items-center justify-between px-2 py-1 bg-muted/20">
                <button
                    onClick={onToggleExpanded}
                    className="flex items-center gap-1 hover:text-foreground transition-colors text-xs text-muted-foreground"
                >
                    <span>Config</span>
                    <ChevronDown
                        className={cn(
                            "w-3 h-3 transition-transform duration-200",
                            expanded && "rotate-180",
                        )}
                    />
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onClear();
                    }}
                    disabled={disabled}
                    className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground/60 hover:text-muted-foreground transition-colors disabled:opacity-50"
                    title="Clear all"
                >
                    <X className="w-3 h-3" />
                </button>
            </div>

            {/* Table Content */}
            {expanded && (
                <div className="px-2 py-1.5 space-y-1">
                    {/* Patch rows - sorted by earliest source position */}
                    {srcPos
                        .map((srcPosition, idx) => ({
                            srcPosition,
                            idx,
                            sortKey: typeof srcPosition === "number" ? srcPosition : srcPosition[0],
                        }))
                        .sort((a, b) => a.sortKey - b.sortKey)
                        .map(({ srcPosition, idx }) => {
                            const patchColor = PATCH_COLORS[idx % PATCH_COLORS.length];
                            const hasPairedTarget = idx < tgtPos.length;
                            const srcPosLabel =
                                typeof srcPosition === "number"
                                    ? `${srcPosition}`
                                    : `${srcPosition[0]}–${srcPosition[1] - 1}`;
                            const tgtPosLabel = hasPairedTarget ? `${tgtPos[idx]}` : "?";

                            return (
                                <div
                                    key={`patch-${idx}`}
                                    className="flex items-center gap-1.5 text-[10px]"
                                >
                                    {/* Source position */}
                                    <span className="font-mono text-muted-foreground min-w-[24px] text-right">
                                        {srcPosLabel}
                                    </span>
                                    {/* Arrow - compact */}
                                    <span
                                        className="flex items-center flex-shrink-0"
                                        style={{ color: patchColor.bg }}
                                    >
                                        <span
                                            className="w-4 h-px"
                                            style={{ backgroundColor: patchColor.bg }}
                                        />
                                        <span
                                            className="w-0 h-0 border-t-[3px] border-b-[3px] border-l-[4px] border-t-transparent border-b-transparent -ml-px"
                                            style={{ borderLeftColor: patchColor.bg }}
                                        />
                                    </span>
                                    {/* Target position */}
                                    <span
                                        className={cn(
                                            "font-mono min-w-[24px]",
                                            hasPairedTarget
                                                ? "text-muted-foreground"
                                                : "text-muted-foreground/40 italic",
                                        )}
                                    >
                                        {tgtPosLabel}
                                    </span>
                                </div>
                            );
                        })}

                    {/* Frozen positions section */}
                    {tgtFreeze.length > 0 && (
                        <>
                            {srcPos.length > 0 && (
                                <div className="border-t border-border/20 my-1" />
                            )}
                            <div className="flex items-center gap-1 flex-wrap">
                                {tgtFreeze
                                    .slice()
                                    .sort((a, b) => a - b)
                                    .map((pos) => (
                                        <span
                                            key={`frozen-${pos}`}
                                            className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[10px] font-mono text-cyan-600 dark:text-cyan-400"
                                        >
                                            <Snowflake className="w-2 h-2" />
                                            {pos}
                                        </span>
                                    ))}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export function ActivationPatchingControls({
    initialConfig,
    selectedModel,
    modelsAvailable,
    modelsLoading = false,
    hasExistingData = false,
}: ActivationPatchingControlsProps) {
    const { workspaceId, chartId } = useParams<{ workspaceId: string; chartId: string }>();

    // Get initial values from config with fallbacks
    const initialSrcPrompt = initialConfig.data?.srcPrompt ?? "";
    const initialTgtPrompt = initialConfig.data?.tgtPrompt ?? "";
    const initialSrcPos = initialConfig.data?.srcPos ?? [];
    const initialTgtPos = initialConfig.data?.tgtPos ?? [];
    const initialTgtFreeze = initialConfig.data?.tgtFreeze ?? [];
    const savedModel = initialConfig.data?.model ?? "";

    const { draftModel, setDraftModel, restoreWorkspaceModel } = useDraftModel(
        savedModel,
        initialConfig.id,
    );

    // Source prompt state
    const [srcPrompt, setSrcPrompt] = useState(initialSrcPrompt);
    const [srcTokens, setSrcTokens] = useState<Token[]>([]);
    const [srcPos, setSrcPos] = useState<SourcePosition[]>(initialSrcPos);
    const [srcEditing, setSrcEditing] = useState(!initialSrcPrompt); // Start in view mode if prompt exists
    const [srcTokenizedModel, setSrcTokenizedModel] = useState<string | null>(null);
    const srcTextareaRef = useRef<HTMLTextAreaElement>(null);
    const srcTokenContainerRef = useRef<HTMLDivElement>(null);
    // Prompt that produced the current srcTokens — used by handleSrcTokenize
    // to detect a real prompt edit (vs. a passive blur with a swapped model).
    const lastTokenizedSrcPromptRef = useRef<string>("");

    // Target prompt state
    const [tgtPrompt, setTgtPrompt] = useState(initialTgtPrompt);
    const [tgtTokens, setTgtTokens] = useState<Token[]>([]);
    const [tgtPos, setTgtPos] = useState<number[]>(initialTgtPos);
    const [tgtFreeze, setTgtFreeze] = useState<number[]>(initialTgtFreeze);
    const lastTokenizedTgtPromptRef = useRef<string>("");
    const [tgtEditing, setTgtEditing] = useState(!initialTgtPrompt); // Start in view mode if prompt exists
    const [tgtTokenizedModel, setTgtTokenizedModel] = useState<string | null>(null);
    const tgtTextareaRef = useRef<HTMLTextAreaElement>(null);
    const tgtTokenContainerRef = useRef<HTMLDivElement>(null);

    // Arrow connection state
    const controlsContainerRef = useRef<HTMLDivElement>(null);
    const connectingArrowRef = useRef<SVGPathElement>(null);
    const [hoverTgtIdx, setHoverTgtIdx] = useState<number | null>(null);

    // Patch summary table collapsed state
    const [patchTableExpanded, setPatchTableExpanded] = useState(true);

    // Track the prompts + model from the last successful run (to show predictions).
    // Predictions are only meaningful while the prompt AND the tokenization
    // model still match what produced them; retokenizing under a different
    // model invalidates them.
    const [lastRunSrcPrompt, setLastRunSrcPrompt] = useState<string | null>(
        initialSrcPrompt || null,
    );
    const [lastRunTgtPrompt, setLastRunTgtPrompt] = useState<string | null>(
        initialTgtPrompt || null,
    );
    const [lastRunModel, setLastRunModel] = useState<string | null>(savedModel || null);

    // Auto-run flags - check if we should auto-run on mount (coming from landing page)
    // Only auto-run if all required data is pre-filled and there's no existing chart data
    const shouldAutoRunRef = useRef(
        initialSrcPrompt.length > 0 &&
            initialTgtPrompt.length > 0 &&
            initialSrcPos.length > 0 &&
            initialTgtPos.length > 0 &&
            initialSrcPos.length === initialTgtPos.length &&
            !hasExistingData,
    );
    const hasAutoRunRef = useRef(false);

    // Use shared hook for state management
    const {
        pendingRangeStart,
        setPendingRangeStart,
        handleSrcTokenClick,
        handleTgtTokenClick,
        isConnecting,
        clearAll,
    } = useActivationPatchingState({
        srcPos,
        setSrcPos,
        tgtPos,
        setTgtPos,
        tgtFreeze,
        setTgtFreeze,
    });

    // Clear stale hover when source selections change (e.g. new source added after pairing)
    // Without this, adding a second source would snap an arrow to the previously hovered target
    useEffect(() => {
        setHoverTgtIdx(null);
    }, [srcPos.length]);

    // Show arrows when we have source positions selected (either connecting or connected)
    const showArrows = srcPos.length > 0 && !srcEditing && !tgtEditing;

    // Use shared hook for mouse-following arrow
    const { handleMouseMove, handleMouseLeave } = useMouseFollowingArrow({
        containerRef: controlsContainerRef,
        connectingArrowRef,
        isConnecting: isConnecting && !srcEditing && !tgtEditing,
        srcPos,
        tgtPos,
        enabled: true,
    });

    // Mutations
    const { mutateAsync: computePatching, isPending: isComputing } = useActivationPatching();
    const { mutateAsync: updateConfig } = useUpdateChartConfig();

    // Only track actual computation for the Run button state
    // Config updates (like saving line selection) should not affect the Run button
    const isExecuting = isComputing;
    const interactive = modelsAvailable && !isExecuting;

    // Background tokenizations of the saved prompts under (saved, selected)
    // models. Used only by the banner-comparison logic; never written to the
    // visible srcTokens / tgtTokens.
    const {
        underSaved: savedSrcTokensUnderSavedModel,
        underSelected: savedSrcTokensUnderSelectedModel,
    } = useBackgroundTokenPair(initialSrcPrompt, savedModel, selectedModel);
    const {
        underSaved: savedTgtTokensUnderSavedModel,
        underSelected: savedTgtTokensUnderSelectedModel,
    } = useBackgroundTokenPair(initialTgtPrompt, savedModel, selectedModel);

    // Tracks pending auto-tokenizes scheduled by blur handlers so resetDraft
    // can cancel them. Without this, clicking Reset races with the 100ms-
    // delayed tokenize call: the stale callback fires with the draft prompt
    // and overwrites the just-restored state.
    const srcBlurTokenize = useBlurTokenizeScheduler();
    const tgtBlurTokenize = useBlurTokenizeScheduler();

    const resetDraft = useCallback(() => {
        srcBlurTokenize.cancel();
        tgtBlurTokenize.cancel();

        const savedSrcPrompt = initialConfig.data?.srcPrompt ?? "";
        const savedTgtPrompt = initialConfig.data?.tgtPrompt ?? "";
        const m = initialConfig.data?.model ?? "";

        setSrcPrompt(savedSrcPrompt);
        setTgtPrompt(savedTgtPrompt);
        setSrcPos(initialConfig.data?.srcPos ?? []);
        setTgtPos(initialConfig.data?.tgtPos ?? []);
        setTgtFreeze(initialConfig.data?.tgtFreeze ?? []);
        setDraftModel(m);
        restoreWorkspaceModel(m);

        // Re-tokenize the restored prompts under the saved model so the
        // visible tokens match the restored config (and the arrows align).
        if (!m) return;
        if (savedSrcPrompt) {
            encodeText(savedSrcPrompt, m)
                .then((tokens) => {
                    if (tokens.length > 0) {
                        setSrcTokens(tokens);
                        setSrcTokenizedModel(m);
                        setSrcEditing(false);
                        lastTokenizedSrcPromptRef.current = savedSrcPrompt;
                    }
                })
                .catch(() => {
                    /* user can manually retokenize */
                });
        }
        if (savedTgtPrompt) {
            encodeText(savedTgtPrompt, m)
                .then((tokens) => {
                    if (tokens.length > 0) {
                        setTgtTokens(tokens);
                        setTgtTokenizedModel(m);
                        setTgtEditing(false);
                        lastTokenizedTgtPromptRef.current = savedTgtPrompt;
                    }
                })
                .catch(() => {
                    /* user can manually retokenize */
                });
        }
    }, [
        initialConfig.data,
        setSrcPos,
        setTgtPos,
        setTgtFreeze,
        setDraftModel,
        restoreWorkspaceModel,
        srcBlurTokenize,
        tgtBlurTokenize,
    ]);

    // Acknowledge "use the selected model for this chart". Local-only — the
    // DB row is unchanged until the user clicks Run. Also re-tokenizes both
    // visible prompts under the new model so the user can see the difference.
    // Positions are cleared: they were chosen against the prior tokenization
    // and aren't meaningful under the new one. Reset restores them if the
    // user changes their mind.
    const updateConfigModel = useCallback(() => {
        if (!selectedModel) return;
        srcBlurTokenize.cancel();
        tgtBlurTokenize.cancel();
        setDraftModel(selectedModel);
        // Token-indexed positions invalidate under the new tokenization.
        if (srcPos.length > 0) {
            setSrcPos([]);
            setPendingRangeStart(null);
        }
        if (tgtPos.length > 0) setTgtPos([]);
        if (tgtFreeze.length > 0) setTgtFreeze([]);
        if (srcPrompt) {
            encodeText(srcPrompt, selectedModel)
                .then((tokens) => {
                    if (tokens.length > 0) {
                        setSrcTokens(tokens);
                        setSrcTokenizedModel(selectedModel);
                        setSrcEditing(false);
                        lastTokenizedSrcPromptRef.current = srcPrompt;
                    }
                })
                .catch(() => {
                    /* user can manually retokenize */
                });
        }
        if (tgtPrompt) {
            encodeText(tgtPrompt, selectedModel)
                .then((tokens) => {
                    if (tokens.length > 0) {
                        setTgtTokens(tokens);
                        setTgtTokenizedModel(selectedModel);
                        setTgtEditing(false);
                        lastTokenizedTgtPromptRef.current = tgtPrompt;
                    }
                })
                .catch(() => {
                    /* user can manually retokenize */
                });
        }
    }, [
        selectedModel,
        srcPrompt,
        tgtPrompt,
        srcPos,
        tgtPos,
        tgtFreeze,
        setSrcPos,
        setTgtPos,
        setTgtFreeze,
        setPendingRangeStart,
    ]);

    // Fetch chart data for prediction tokens (cached by React Query)
    interface ActivationPatchingChart {
        id: string;
        data: ActivationPatchingData | null;
        type: string;
    }

    const { data: chart } = useQuery({
        queryKey: queryKeys.charts.chart(chartId),
        queryFn: () => getChartById(chartId as string),
        enabled: !!chartId,
    });

    const patchingChart = chart as ActivationPatchingChart | undefined;
    const hasChartData =
        patchingChart?.data && "lines" in patchingChart.data && patchingChart.data.lines.length > 0;

    // Compute prediction tokens (first two labels are source and target predictions)
    // Only show predictions when the current prompt matches the last run prompt
    const allLabels = useMemo(() => {
        if (!hasChartData || !patchingChart?.data?.tokenLabels) return [];
        return patchingChart.data.tokenLabels;
    }, [hasChartData, patchingChart?.data?.tokenLabels]);

    const srcPrediction = useMemo(() => {
        if (!allLabels.length || allLabels.length < 1) return null;
        if (srcPrompt !== lastRunSrcPrompt) return null;
        // Hide when retokenization has happened under a different model than
        // the one that produced the run.
        if (srcTokenizedModel !== lastRunModel) return null;
        return allLabels[0];
    }, [allLabels, srcPrompt, lastRunSrcPrompt, srcTokenizedModel, lastRunModel]);

    const tgtPrediction = useMemo(() => {
        if (!allLabels.length || allLabels.length < 2) return null;
        if (tgtPrompt !== lastRunTgtPrompt) return null;
        if (tgtTokenizedModel !== lastRunModel) return null;
        return allLabels[1];
    }, [allLabels, tgtPrompt, lastRunTgtPrompt, tgtTokenizedModel, lastRunModel]);

    // Auto-retokenize on selected-model change when the chart has no data
    // yet. During initial composition the user has no committed visualization
    // to protect, so swapping the global model selector should immediately
    // re-tokenize under the new model and align draftModel — otherwise the
    // Run button stays disabled and the explicit Sync action is hidden by
    // its !hasExistingData guard.
    useEffect(() => {
        if (hasExistingData) return;
        if (!selectedModel) return;
        let cancelled = false;

        if (srcPrompt && !srcEditing && srcTokenizedModel !== selectedModel) {
            encodeText(srcPrompt, selectedModel)
                .then((tokens) => {
                    if (cancelled || tokens.length === 0) return;
                    setSrcTokens(tokens);
                    setSrcTokenizedModel(selectedModel);
                    lastTokenizedSrcPromptRef.current = srcPrompt;
                    setDraftModel(selectedModel);
                })
                .catch(() => {
                    /* tokenizer failure — leave editor open */
                });
        }

        if (tgtPrompt && !tgtEditing && tgtTokenizedModel !== selectedModel) {
            encodeText(tgtPrompt, selectedModel)
                .then((tokens) => {
                    if (cancelled || tokens.length === 0) return;
                    setTgtTokens(tokens);
                    setTgtTokenizedModel(selectedModel);
                    lastTokenizedTgtPromptRef.current = tgtPrompt;
                    setDraftModel(selectedModel);
                })
                .catch(() => {
                    /* tokenizer failure — leave editor open */
                });
        }

        return () => {
            cancelled = true;
        };
    }, [
        hasExistingData,
        selectedModel,
        srcPrompt,
        tgtPrompt,
        srcEditing,
        tgtEditing,
        srcTokenizedModel,
        tgtTokenizedModel,
    ]);

    // Initial-load tokenization for the visible token view. Uses the SAVED
    // model so switching the global model selector doesn't silently
    // re-tokenize what the user is looking at. Only re-fires when the chart
    // itself changes.
    useEffect(() => {
        const fetchTokens = async () => {
            if (!savedModel) return;
            try {
                if (initialConfig.data?.srcPrompt) {
                    const tokens = await encodeText(initialConfig.data.srcPrompt, savedModel);
                    if (tokens.length > 0) {
                        setSrcTokens(tokens);
                        setSrcTokenizedModel(savedModel);
                        setSrcEditing(false);
                        lastTokenizedSrcPromptRef.current = initialConfig.data.srcPrompt;
                    }
                }
                if (initialConfig.data?.tgtPrompt) {
                    const tokens = await encodeText(initialConfig.data.tgtPrompt, savedModel);
                    if (tokens.length > 0) {
                        setTgtTokens(tokens);
                        setTgtTokenizedModel(savedModel);
                        setTgtEditing(false);
                        lastTokenizedTgtPromptRef.current = initialConfig.data.tgtPrompt;
                    }
                }
            } catch {
                /* swallow; user can retokenize via blur/run */
            }
        };
        fetchTokens();
    }, [initialConfig.id, savedModel]);

    // Handle tokenization for source prompt
    const handleSrcTokenize = useCallback(async () => {
        if (!srcPrompt) return;
        const tokens = await encodeText(srcPrompt, selectedModel);
        if (tokens.length > 0) {
            const tokensChanged =
                tokens.length !== srcTokens.length ||
                tokens.some((t, i) => t.text !== srcTokens[i]?.text);
            // Real edit = the prompt text differs from what produced the
            // current srcTokens. A passive blur (no edit) leaves this false
            // even if the selected model has changed since.
            const promptChanged = srcPrompt !== lastTokenizedSrcPromptRef.current;
            const modelChanged = srcTokenizedModel !== null && srcTokenizedModel !== selectedModel;

            setSrcTokens(tokens);
            setSrcTokenizedModel(selectedModel);
            setSrcEditing(false);
            lastTokenizedSrcPromptRef.current = srcPrompt;

            // Positions invalidate on any real prompt edit, regardless of
            // whether the model also changed.
            if (tokensChanged && promptChanged) {
                if (srcPos.length > 0) {
                    setSrcPos([]);
                    setPendingRangeStart(null);
                }
                if (tgtPos.length > 0) setTgtPos([]);
            }

            // Editing the prompt while a different model is selected is an
            // implicit commit — mirror the "Update config to selected model"
            // action so the draft model aligns and the banner state matches.
            // Also re-tokenize the OTHER prompt so both panels stay under the
            // same tokenizer; otherwise the user would have to click into the
            // target textarea and blur back out to bring it in sync.
            if (promptChanged && modelChanged) {
                setDraftModel(selectedModel);
                if (tgtPrompt && !tgtEditing) {
                    encodeText(tgtPrompt, selectedModel)
                        .then((tgtToks) => {
                            if (tgtToks.length === 0) return;
                            setTgtTokens(tgtToks);
                            setTgtTokenizedModel(selectedModel);
                            lastTokenizedTgtPromptRef.current = tgtPrompt;
                        })
                        .catch(() => {
                            /* tgt left as-is; user can manually retokenize */
                        });
                }
            }
        }
    }, [
        srcPrompt,
        selectedModel,
        srcPos,
        tgtPos,
        srcTokens,
        srcTokenizedModel,
        tgtPrompt,
        tgtEditing,
        setPendingRangeStart,
    ]);

    // Handle tokenization for target prompt
    const handleTgtTokenize = useCallback(async () => {
        if (!tgtPrompt) return;
        const tokens = await encodeText(tgtPrompt, selectedModel);
        if (tokens.length > 0) {
            const tokensChanged =
                tokens.length !== tgtTokens.length ||
                tokens.some((t, i) => t.text !== tgtTokens[i]?.text);
            const promptChanged = tgtPrompt !== lastTokenizedTgtPromptRef.current;
            const modelChanged = tgtTokenizedModel !== null && tgtTokenizedModel !== selectedModel;

            setTgtTokens(tokens);
            setTgtTokenizedModel(selectedModel);
            setTgtEditing(false);
            lastTokenizedTgtPromptRef.current = tgtPrompt;

            // Positions invalidate on any real prompt edit, regardless of
            // whether the model also changed.
            if (tokensChanged && promptChanged) {
                if (tgtPos.length > 0) setTgtPos([]);
                if (tgtFreeze.length > 0) setTgtFreeze([]);
                if (srcPos.length > 0) setSrcPos([]);
            }

            // Implicit commit — same as handleSrcTokenize. Also cascade the
            // retokenization to the OTHER prompt so both stay under the same
            // tokenizer.
            if (promptChanged && modelChanged) {
                setDraftModel(selectedModel);
                if (srcPrompt && !srcEditing) {
                    encodeText(srcPrompt, selectedModel)
                        .then((srcToks) => {
                            if (srcToks.length === 0) return;
                            setSrcTokens(srcToks);
                            setSrcTokenizedModel(selectedModel);
                            lastTokenizedSrcPromptRef.current = srcPrompt;
                        })
                        .catch(() => {
                            /* src left as-is; user can manually retokenize */
                        });
                }
            }
        }
    }, [
        tgtPrompt,
        selectedModel,
        srcPos,
        tgtPos,
        tgtFreeze,
        tgtTokens,
        tgtTokenizedModel,
        srcPrompt,
        srcEditing,
    ]);

    // Handle blur for source
    const handleSrcBlur = useCallback(() => {
        srcBlurTokenize.schedule(() => {
            const activeElement = document.activeElement;
            const withinTextarea = activeElement && srcTextareaRef.current?.contains(activeElement);
            const withinToken =
                activeElement && srcTokenContainerRef.current?.contains(activeElement);
            const popoverOpen = document.querySelector("[data-radix-popper-content-wrapper]");
            if (withinTextarea || withinToken || popoverOpen) return;
            if (srcPrompt) handleSrcTokenize();
        });
    }, [srcPrompt, handleSrcTokenize, srcBlurTokenize]);

    // Handle blur for target
    const handleTgtBlur = useCallback(() => {
        tgtBlurTokenize.schedule(() => {
            const activeElement = document.activeElement;
            const withinTextarea = activeElement && tgtTextareaRef.current?.contains(activeElement);
            const withinToken =
                activeElement && tgtTokenContainerRef.current?.contains(activeElement);
            const popoverOpen = document.querySelector("[data-radix-popper-content-wrapper]");
            if (withinTextarea || withinToken || popoverOpen) return;
            if (tgtPrompt) handleTgtTokenize();
        });
    }, [tgtPrompt, handleTgtTokenize, tgtBlurTokenize]);

    // Handle form submission
    const handleSubmit = useCallback(async () => {
        if (!srcPrompt || !tgtPrompt) {
            toast.error("Please enter both source and target prompts.");
            return;
        }

        if (srcPos.length === 0 || tgtPos.length === 0) {
            toast.error("Please select at least one token position in both prompts.");
            return;
        }

        if (srcPos.length !== tgtPos.length) {
            toast.error("Source and target must have the same number of selected positions.");
            return;
        }

        // Tokenize both prompts to ensure they're in sync
        let srcToks: Token[];
        let tgtToks: Token[];
        try {
            srcToks = await encodeText(srcPrompt, selectedModel);
            tgtToks = await encodeText(tgtPrompt, selectedModel);
        } catch (error) {
            if (error instanceof TokenizerLoadError) {
                toast.error(
                    `Could not load tokenizer for ${selectedModel}. The model may be gated and require authentication.`,
                );
            } else {
                toast.error("Failed to tokenize prompts.");
            }
            return;
        }

        if (srcToks.length <= 1 || tgtToks.length <= 1) {
            toast.error("Please enter longer prompts.");
            return;
        }

        setSrcTokens(srcToks);
        setTgtTokens(tgtToks);
        setSrcTokenizedModel(selectedModel);
        setTgtTokenizedModel(selectedModel);
        lastTokenizedSrcPromptRef.current = srcPrompt;
        lastTokenizedTgtPromptRef.current = tgtPrompt;

        const config: ActivationPatchingConfigData = {
            ...initialConfig.data,
            model: selectedModel,
            srcPrompt,
            tgtPrompt,
            srcPos,
            tgtPos,
            tgtFreeze,
        };

        try {
            // Save config first with reset token selection — new run means new tokens.
            // This must happen before computePatching so the widget uses [0,1] when
            // new data arrives and triggers a rebuild.
            await updateConfig({
                configId: initialConfig.id,
                chartId,
                config: {
                    data: { ...config, selectedLineIndices: [0, 1] },
                    workspaceId,
                    type: "activation-patching",
                },
            });

            await computePatching({
                request: {
                    completion: config,
                    chartId,
                },
                configId: initialConfig.id,
            });

            // Land draftModel on the model that just persisted so the banner
            // doesn't flash between the run completing and the refetch arriving.
            setDraftModel(selectedModel);
            setPatchTableExpanded(false);
            setLastRunSrcPrompt(srcPrompt);
            setLastRunTgtPrompt(tgtPrompt);
            setLastRunModel(selectedModel);
            setSrcEditing(false);
            setTgtEditing(false);
        } catch (error) {
            toast.error("Failed to run activation patching.");
        }
    }, [
        srcPrompt,
        tgtPrompt,
        srcPos,
        tgtPos,
        tgtFreeze,
        selectedModel,
        chartId,
        initialConfig.id,
        initialConfig.data,
        workspaceId,
        computePatching,
        updateConfig,
    ]);

    // Auto-run effect for when coming from landing page
    useEffect(() => {
        const autoRunPatching = async () => {
            // Only auto-run if:
            // 1. shouldAutoRunRef is true (all required data pre-filled)
            // 2. We haven't auto-run before
            // 3. A model is available
            // 4. Not currently executing
            if (
                shouldAutoRunRef.current &&
                !hasAutoRunRef.current &&
                selectedModel &&
                selectedModel.length > 0 &&
                !isExecuting
            ) {
                hasAutoRunRef.current = true;
                shouldAutoRunRef.current = false;

                try {
                    const srcToks = await encodeText(initialSrcPrompt, selectedModel);
                    const tgtToks = await encodeText(initialTgtPrompt, selectedModel);

                    if (srcToks.length <= 1 || tgtToks.length <= 1) return;

                    setSrcTokens(srcToks);
                    setTgtTokens(tgtToks);
                    setSrcTokenizedModel(selectedModel);
                    setTgtTokenizedModel(selectedModel);
                    setSrcEditing(false);
                    setTgtEditing(false);
                    lastTokenizedSrcPromptRef.current = initialSrcPrompt;
                    lastTokenizedTgtPromptRef.current = initialTgtPrompt;

                    const config: ActivationPatchingConfigData = {
                        ...initialConfig.data,
                        model: selectedModel,
                        srcPrompt: initialSrcPrompt,
                        tgtPrompt: initialTgtPrompt,
                        srcPos: initialSrcPos,
                        tgtPos: initialTgtPos,
                        tgtFreeze: initialTgtFreeze,
                    };

                    // Save config with reset selection before compute
                    await updateConfig({
                        configId: initialConfig.id,
                        chartId,
                        config: {
                            data: { ...config, selectedLineIndices: [0, 1] },
                            workspaceId,
                            type: "activation-patching",
                        },
                    });

                    await computePatching({
                        request: {
                            completion: config,
                            chartId,
                        },
                        configId: initialConfig.id,
                    });

                    setPatchTableExpanded(false);
                    setLastRunSrcPrompt(initialSrcPrompt);
                    setLastRunTgtPrompt(initialTgtPrompt);
                    setLastRunModel(selectedModel);
                } catch (error) {
                    // Don't reset flags - we only try once
                }
            }
        };

        // Small delay to ensure all dependencies are ready
        const timer = setTimeout(autoRunPatching, 800);
        return () => clearTimeout(timer);
    }, [
        selectedModel,
        isExecuting,
        initialSrcPrompt,
        initialTgtPrompt,
        initialSrcPos,
        initialTgtPos,
        initialTgtFreeze,
        chartId,
        initialConfig.id,
        initialConfig.data,
        computePatching,
        updateConfig,
    ]);

    // Both prompts must be tokenized under the selected model AND the
    // tokenizations must reflect the current prompt text (no pending edits).
    const srcTokensInSync =
        srcTokens.length > 0 &&
        srcTokenizedModel === selectedModel &&
        lastTokenizedSrcPromptRef.current === srcPrompt;
    const tgtTokensInSync =
        tgtTokens.length > 0 &&
        tgtTokenizedModel === selectedModel &&
        lastTokenizedTgtPromptRef.current === tgtPrompt;

    // Check if ready to run - requires equal number of source and target positions
    const canRun =
        srcPrompt &&
        tgtPrompt &&
        srcPos.length > 0 &&
        tgtPos.length > 0 &&
        srcPos.length === tgtPos.length &&
        srcTokensInSync &&
        tgtTokensInSync &&
        interactive;

    // --- diff state -----------------------------------------------------------

    const draftMatchesSaved = useMemo(
        () =>
            apConfigEqualsExceptModel(initialConfig.data, {
                srcPrompt,
                tgtPrompt,
                srcPos,
                tgtPos,
                tgtFreeze,
            }),
        [initialConfig.data, srcPrompt, tgtPrompt, srcPos, tgtPos, tgtFreeze],
    );

    // Draft is dirty if any non-model field differs OR the draft model differs
    // from the saved model. Either case surfaces the Unsaved-changes banner.
    const draftDirty = !draftMatchesSaved || draftModel !== savedModel;
    const modelMismatchVsConfig = modelsAvailable && !!draftModel && draftModel !== selectedModel;

    const tokenizationDiffers = useMemo(() => {
        if (!modelMismatchVsConfig) return false;
        const srcDiffers =
            savedSrcTokensUnderSavedModel && savedSrcTokensUnderSelectedModel
                ? !tokenTextSequencesEqual(
                      savedSrcTokensUnderSavedModel,
                      savedSrcTokensUnderSelectedModel,
                  )
                : false;
        const tgtDiffers =
            savedTgtTokensUnderSavedModel && savedTgtTokensUnderSelectedModel
                ? !tokenTextSequencesEqual(
                      savedTgtTokensUnderSavedModel,
                      savedTgtTokensUnderSelectedModel,
                  )
                : false;
        return srcDiffers || tgtDiffers;
    }, [
        modelMismatchVsConfig,
        savedSrcTokensUnderSavedModel,
        savedSrcTokensUnderSelectedModel,
        savedTgtTokensUnderSavedModel,
        savedTgtTokensUnderSelectedModel,
    ]);

    // Title-row action visibility (see handoff §3).
    const showReset = draftDirty && hasExistingData;
    const showSync = modelMismatchVsConfig;
    const viewMode = !modelsAvailable && !modelsLoading;

    return (
        <>
            <ToolPanelHeader
                title="Activation Patching"
                viewMode={viewMode}
                showReset={showReset}
                showSync={showSync}
                isExecuting={isExecuting}
                onReset={resetDraft}
                onSync={updateConfigModel}
                syncClassName="bg-violet-500 hover:bg-violet-600 text-white"
            />
            <div
                ref={controlsContainerRef}
                className="relative flex flex-col gap-4 p-3 flex-1 overflow-auto"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            >
                {/* Arrow SVG overlay */}
                {showArrows && (
                    <EnhancedPatchArrows
                        containerRef={controlsContainerRef}
                        srcPos={srcPos}
                        tgtPos={tgtPos}
                        srcEditing={srcEditing}
                        tgtEditing={tgtEditing}
                        hoverTgtIdx={hoverTgtIdx}
                        isConnecting={isConnecting && !srcEditing && !tgtEditing}
                        enableGlow={true}
                        enableMouseFollowing={true}
                        connectingArrowRef={connectingArrowRef}
                    />
                )}

                {/* Source Prompt - with range selection support */}
                <div className="flex flex-col gap-1">
                    <PatchPromptSection
                        variant="source"
                        mode="full"
                        label="Source Prompt"
                        prompt={srcPrompt}
                        setPrompt={setSrcPrompt}
                        tokens={srcTokens}
                        selectedModel={selectedModel}
                        isEditing={srcEditing}
                        setIsEditing={setSrcEditing}
                        isExecuting={isExecuting}
                        disabled={!modelsAvailable}
                        tokenizedModel={srcTokenizedModel}
                        textareaRef={srcTextareaRef}
                        tokenContainerRef={srcTokenContainerRef}
                        onBlur={handleSrcBlur}
                        selectedPositions={srcPos}
                        pendingRangeStart={pendingRangeStart}
                        onSrcTokenClick={interactive ? handleSrcTokenClick : undefined}
                        predictionToken={srcPrediction}
                    />
                    {!srcEditing && srcTokens.length > 0 && (
                        <p className="text-[11px] text-muted-foreground/70">
                            <span className="font-medium">Shift+click</span> to select a range of
                            tokens
                        </p>
                    )}
                </div>

                {/* Target Prompt */}
                <div className="flex flex-col gap-1">
                    <PatchPromptSection
                        variant="target"
                        mode="full"
                        label="Target Prompt"
                        prompt={tgtPrompt}
                        setPrompt={setTgtPrompt}
                        tokens={tgtTokens}
                        selectedModel={selectedModel}
                        isEditing={tgtEditing}
                        setIsEditing={setTgtEditing}
                        isExecuting={isExecuting}
                        disabled={!modelsAvailable}
                        tokenizedModel={tgtTokenizedModel}
                        textareaRef={tgtTextareaRef}
                        tokenContainerRef={tgtTokenContainerRef}
                        onBlur={handleTgtBlur}
                        tgtSelectedPositions={tgtPos}
                        frozenPositions={tgtFreeze}
                        onTgtTokenClick={interactive ? handleTgtTokenClick : undefined}
                        onTokenHover={
                            interactive && isConnecting && !srcEditing && !tgtEditing
                                ? setHoverTgtIdx
                                : undefined
                        }
                        onTokenLeave={
                            interactive && isConnecting && !srcEditing && !tgtEditing
                                ? () => setHoverTgtIdx(null)
                                : undefined
                        }
                        predictionToken={tgtPrediction}
                    />
                    {!tgtEditing && tgtTokens.length > 0 && (
                        <p className="text-[11px] text-muted-foreground/70">
                            <span className="font-medium">⌘/Ctrl+click</span> to freeze tokens
                        </p>
                    )}
                </div>

                {/* Collapsible Patch Summary Table */}
                <PatchConfigTable
                    srcPos={srcPos}
                    tgtPos={tgtPos}
                    tgtFreeze={tgtFreeze}
                    expanded={patchTableExpanded}
                    onToggleExpanded={() => setPatchTableExpanded(!patchTableExpanded)}
                    onClear={clearAll}
                    disabled={!interactive}
                />

                {/* Run Button */}
                <Button
                    onClick={handleSubmit}
                    disabled={!canRun}
                    className="w-full bg-violet-500 hover:bg-violet-600 text-white"
                >
                    {isExecuting ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Computing...
                        </>
                    ) : (
                        <>
                            <Play className="mr-2 h-4 w-4" />
                            Run
                        </>
                    )}
                </Button>
            </div>
        </>
    );
}
