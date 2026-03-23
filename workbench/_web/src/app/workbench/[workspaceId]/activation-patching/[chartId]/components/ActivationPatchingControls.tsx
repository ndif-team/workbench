"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, Play, X, Snowflake, ChevronDown } from "lucide-react";
import { useActivationPatching } from "@/lib/api/activationPatchingApi";
import { useUpdateChartConfig } from "@/lib/api/configApi";
import { ActivationPatchingConfigData, ActivationPatchingData, SourcePosition } from "@/types/activationPatching";
import { encodeText } from "@/actions/tok";
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

interface ActivationPatchingConfig {
    id: string;
    data: ActivationPatchingConfigData;
    type: string;
}

interface ActivationPatchingControlsProps {
    initialConfig: ActivationPatchingConfig;
    selectedModel: string;
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
                            expanded && "rotate-180"
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
                            const srcPosLabel = typeof srcPosition === "number"
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
                                                : "text-muted-foreground/40 italic"
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
                            {srcPos.length > 0 && <div className="border-t border-border/20 my-1" />}
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
    hasExistingData = false,
}: ActivationPatchingControlsProps) {
    const { workspaceId, chartId } = useParams<{ workspaceId: string; chartId: string }>();

    // Get initial values from config with fallbacks
    const initialSrcPrompt = initialConfig.data?.srcPrompt ?? "";
    const initialTgtPrompt = initialConfig.data?.tgtPrompt ?? "";
    const initialSrcPos = initialConfig.data?.srcPos ?? [];
    const initialTgtPos = initialConfig.data?.tgtPos ?? [];
    const initialTgtFreeze = initialConfig.data?.tgtFreeze ?? [];

    // Source prompt state
    const [srcPrompt, setSrcPrompt] = useState(initialSrcPrompt);
    const [srcTokens, setSrcTokens] = useState<Token[]>([]);
    const [srcPos, setSrcPos] = useState<SourcePosition[]>(initialSrcPos);
    const [srcEditing, setSrcEditing] = useState(!initialSrcPrompt); // Start in view mode if prompt exists
    const [srcTokenizedModel, setSrcTokenizedModel] = useState<string | null>(null);
    const srcTextareaRef = useRef<HTMLTextAreaElement>(null);
    const srcTokenContainerRef = useRef<HTMLDivElement>(null);

    // Target prompt state
    const [tgtPrompt, setTgtPrompt] = useState(initialTgtPrompt);
    const [tgtTokens, setTgtTokens] = useState<Token[]>([]);
    const [tgtPos, setTgtPos] = useState<number[]>(initialTgtPos);
    const [tgtFreeze, setTgtFreeze] = useState<number[]>(initialTgtFreeze);
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

    // Track the prompts from the last successful run (to show predictions)
    const [lastRunSrcPrompt, setLastRunSrcPrompt] = useState<string | null>(initialSrcPrompt || null);
    const [lastRunTgtPrompt, setLastRunTgtPrompt] = useState<string | null>(initialTgtPrompt || null);

    // Auto-run flags - check if we should auto-run on mount (coming from landing page)
    // Only auto-run if all required data is pre-filled and there's no existing chart data
    const shouldAutoRunRef = useRef(
        initialSrcPrompt.length > 0 &&
        initialTgtPrompt.length > 0 &&
        initialSrcPos.length > 0 &&
        initialTgtPos.length > 0 &&
        initialSrcPos.length === initialTgtPos.length &&
        !hasExistingData
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
    const hasChartData = patchingChart?.data && "lines" in patchingChart.data && patchingChart.data.lines.length > 0;

    // Compute prediction tokens (first two labels are source and target predictions)
    // Only show predictions when the current prompt matches the last run prompt
    const allLabels = useMemo(() => {
        if (!hasChartData || !patchingChart?.data?.tokenLabels) return [];
        return patchingChart.data.tokenLabels;
    }, [hasChartData, patchingChart?.data?.tokenLabels]);

    const srcPrediction = useMemo(() => {
        if (!allLabels.length || allLabels.length < 1) return null;
        if (srcPrompt !== lastRunSrcPrompt) return null;
        return allLabels[0];
    }, [allLabels, srcPrompt, lastRunSrcPrompt]);

    const tgtPrediction = useMemo(() => {
        if (!allLabels.length || allLabels.length < 2) return null;
        if (tgtPrompt !== lastRunTgtPrompt) return null;
        return allLabels[1];
    }, [allLabels, tgtPrompt, lastRunTgtPrompt]);

    // Tokenize prompts on initial load if they exist
    useEffect(() => {
        const fetchTokens = async () => {
            if (initialConfig.data?.srcPrompt && selectedModel) {
                const tokens = await encodeText(initialConfig.data.srcPrompt, selectedModel);
                if (tokens.length > 0) {
                    setSrcTokens(tokens);
                    setSrcTokenizedModel(selectedModel);
                    setSrcEditing(false);
                }
            }
            if (initialConfig.data?.tgtPrompt && selectedModel) {
                const tokens = await encodeText(initialConfig.data.tgtPrompt, selectedModel);
                if (tokens.length > 0) {
                    setTgtTokens(tokens);
                    setTgtTokenizedModel(selectedModel);
                    setTgtEditing(false);
                }
            }
        };
        fetchTokens();
    }, [initialConfig.id, selectedModel]);

    // Handle tokenization for source prompt
    const handleSrcTokenize = useCallback(async () => {
        if (!srcPrompt) return;
        const tokens = await encodeText(srcPrompt, selectedModel);
        if (tokens.length > 0) {
            // Check if tokens actually changed (prompt was modified)
            const tokensChanged = tokens.length !== srcTokens.length ||
                tokens.some((t, i) => t.text !== srcTokens[i]?.text);

            setSrcTokens(tokens);
            setSrcTokenizedModel(selectedModel);
            setSrcEditing(false);

            // Reset positions if tokens changed (prompt was modified)
            if (tokensChanged && srcPos.length > 0) {
                setSrcPos([]);
                setPendingRangeStart(null);
            }
        }
    }, [srcPrompt, selectedModel, srcPos, srcTokens, setPendingRangeStart]);

    // Handle tokenization for target prompt
    const handleTgtTokenize = useCallback(async () => {
        if (!tgtPrompt) return;
        const tokens = await encodeText(tgtPrompt, selectedModel);
        if (tokens.length > 0) {
            // Check if tokens actually changed (prompt was modified)
            const tokensChanged = tokens.length !== tgtTokens.length ||
                tokens.some((t, i) => t.text !== tgtTokens[i]?.text);

            setTgtTokens(tokens);
            setTgtTokenizedModel(selectedModel);
            setTgtEditing(false);

            // Reset positions if tokens changed (prompt was modified)
            if (tokensChanged) {
                if (tgtPos.length > 0) setTgtPos([]);
                if (tgtFreeze.length > 0) setTgtFreeze([]);
            }
        }
    }, [tgtPrompt, selectedModel, tgtPos, tgtFreeze, tgtTokens]);

    // Handle blur for source
    const handleSrcBlur = useCallback(() => {
        setTimeout(() => {
            const activeElement = document.activeElement;
            const withinTextarea = activeElement && srcTextareaRef.current?.contains(activeElement);
            const withinToken = activeElement && srcTokenContainerRef.current?.contains(activeElement);
            const popoverOpen = document.querySelector("[data-radix-popper-content-wrapper]");

            if (withinTextarea || withinToken || popoverOpen) return;

            if (srcPrompt) {
                handleSrcTokenize();
            }
        }, 100);
    }, [srcPrompt, handleSrcTokenize]);

    // Handle blur for target
    const handleTgtBlur = useCallback(() => {
        setTimeout(() => {
            const activeElement = document.activeElement;
            const withinTextarea = activeElement && tgtTextareaRef.current?.contains(activeElement);
            const withinToken = activeElement && tgtTokenContainerRef.current?.contains(activeElement);
            const popoverOpen = document.querySelector("[data-radix-popper-content-wrapper]");

            if (withinTextarea || withinToken || popoverOpen) return;

            if (tgtPrompt) {
                handleTgtTokenize();
            }
        }, 100);
    }, [tgtPrompt, handleTgtTokenize]);

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
        const srcToks = await encodeText(srcPrompt, selectedModel);
        const tgtToks = await encodeText(tgtPrompt, selectedModel);

        if (srcToks.length <= 1 || tgtToks.length <= 1) {
            toast.error("Please enter longer prompts.");
            return;
        }

        setSrcTokens(srcToks);
        setTgtTokens(tgtToks);
        setSrcTokenizedModel(selectedModel);
        setTgtTokenizedModel(selectedModel);

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

            setPatchTableExpanded(false);
            setLastRunSrcPrompt(srcPrompt);
            setLastRunTgtPrompt(tgtPrompt);
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

    // Check if ready to run - requires equal number of source and target positions
    const canRun =
        srcPrompt &&
        tgtPrompt &&
        srcPos.length > 0 &&
        tgtPos.length > 0 &&
        srcPos.length === tgtPos.length &&
        !isExecuting;

    return (
        <div
            ref={controlsContainerRef}
            className="relative flex flex-col gap-4"
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
                    tokenizedModel={srcTokenizedModel}
                    textareaRef={srcTextareaRef}
                    tokenContainerRef={srcTokenContainerRef}
                    onBlur={handleSrcBlur}
                    selectedPositions={srcPos}
                    pendingRangeStart={pendingRangeStart}
                    onSrcTokenClick={handleSrcTokenClick}
                    predictionToken={srcPrediction}
                />
                {!srcEditing && srcTokens.length > 0 && (
                    <p className="text-[11px] text-muted-foreground/70">
                        <span className="font-medium">Shift+click</span> to select a range of tokens
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
                    tokenizedModel={tgtTokenizedModel}
                    textareaRef={tgtTextareaRef}
                    tokenContainerRef={tgtTokenContainerRef}
                    onBlur={handleTgtBlur}
                    tgtSelectedPositions={tgtPos}
                    frozenPositions={tgtFreeze}
                    onTgtTokenClick={handleTgtTokenClick}
                    onTokenHover={isConnecting && !srcEditing && !tgtEditing ? setHoverTgtIdx : undefined}
                    onTokenLeave={isConnecting && !srcEditing && !tgtEditing ? () => setHoverTgtIdx(null) : undefined}
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
                disabled={isExecuting}
            />


            {/* Run Button */}
            <Button onClick={handleSubmit} disabled={!canRun} className="w-full bg-violet-500 hover:bg-violet-600 text-white">
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
    );
}
