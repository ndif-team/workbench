"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Play, TriangleAlert, MousePointerClick, X } from "lucide-react";
import { useActivationPatching } from "@/lib/api/activationPatchingApi";
import { useUpdateChartConfig } from "@/lib/api/configApi";
import { ActivationPatchingConfigData, ActivationPatchingData, SourcePosition } from "@/types/activationPatching";
import { encodeText } from "@/actions/tok";
import { Token } from "@/types/models";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { getChartById } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { TokenSelector } from "./TokenSelector";

// Create a smooth bezier curve path between two points
function createCurvePath(start: { x: number; y: number }, end: { x: number; y: number }): string {
    const midY = (start.y + end.y) / 2;
    const c1 = { x: start.x, y: midY };
    const c2 = { x: end.x, y: midY };
    return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}

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

// Shared colors for patch arrows and token selection
const PATCH_COLORS = [
    { bg: "#8b5cf6", ring: "#8b5cf6", hover: "rgba(139, 92, 246, 0.2)", hoverRing: "rgba(139, 92, 246, 0.5)" }, // violet
    { bg: "#06b6d4", ring: "#06b6d4", hover: "rgba(6, 182, 212, 0.2)", hoverRing: "rgba(6, 182, 212, 0.5)" },   // cyan
    { bg: "#f59e0b", ring: "#f59e0b", hover: "rgba(245, 158, 11, 0.2)", hoverRing: "rgba(245, 158, 11, 0.5)" }, // amber
    { bg: "#10b981", ring: "#10b981", hover: "rgba(16, 185, 129, 0.2)", hoverRing: "rgba(16, 185, 129, 0.5)" }, // emerald
    { bg: "#ef4444", ring: "#ef4444", hover: "rgba(239, 68, 68, 0.2)", hoverRing: "rgba(239, 68, 68, 0.5)" },   // red
    { bg: "#ec4899", ring: "#ec4899", hover: "rgba(236, 72, 153, 0.2)", hoverRing: "rgba(236, 72, 153, 0.5)" }, // pink
];

// Helper to check if a token index is part of a source position (single or range)
function isTokenInSourcePosition(tokenIdx: number, pos: SourcePosition): boolean {
    if (typeof pos === "number") {
        return tokenIdx === pos;
    }
    // Range: [start, end] - inclusive of start, exclusive of end (like Python slice)
    return tokenIdx >= pos[0] && tokenIdx < pos[1];
}

// Helper to find which source position (and its index) a token belongs to
function findSourcePositionForToken(tokenIdx: number, positions: SourcePosition[]): { pos: SourcePosition; index: number } | null {
    for (let i = 0; i < positions.length; i++) {
        if (isTokenInSourcePosition(tokenIdx, positions[i])) {
            return { pos: positions[i], index: i };
        }
    }
    return null;
}

// Helper to get display text for a source position
function getSourcePositionLabel(pos: SourcePosition): string {
    if (typeof pos === "number") {
        return `${pos}`;
    }
    return `${pos[0]}-${pos[1] - 1}`;
}

// Token styling constants
const TOKEN_STYLES = {
    base: "!text-sm !leading-5 whitespace-pre-wrap break-words select-none !box-border relative px-0.5 py-0.5 rounded-sm transition-all",
    clickable: "bg-muted/60 ring-1 ring-border/50 ring-inset",
    hover: "hover:bg-violet-500/20 hover:ring-1 hover:ring-violet-400/50 hover:ring-inset cursor-pointer",
    selected: "ring-2 ring-inset text-white", // bg and ring colors applied via inline style
} as const;

// Helper to fix newlines for display
const fixTokenText = (text: string) => {
    const numNewlines = (text.match(/\n/g) || []).length;
    const result = text
        .replace(/\r\n/g, "\\r\\n")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
    return { result, numNewlines };
};

// Token display with click-to-select functionality (supports multiple selections)
function SelectableTokenDisplay({
    tokens,
    loading,
    selectedPositions,
    onTokenClick,
    onTokenHover,
    onTokenLeave,
    label,
    side,
}: {
    tokens: Token[];
    loading: boolean;
    selectedPositions: number[];
    onTokenClick: (pos: number) => void;
    onTokenHover?: (pos: number) => void;
    onTokenLeave?: () => void;
    label: string;
    side: "source" | "target";
}) {
    const handleTokenClick = (e: React.MouseEvent, idx: number) => {
        // Stop propagation to prevent triggering edit mode on the container
        e.stopPropagation();
        if (!loading) {
            onTokenClick(idx);
        }
    };

    return (
        <div className="w-full custom-scrollbar select-none whitespace-pre-wrap break-words">
            {tokens.length === 0 ? (
                <span className="text-muted-foreground text-sm italic">
                    Enter text and click away to tokenize
                </span>
            ) : (
                tokens.map((token, idx) => {
                    const { result, numNewlines } = fixTokenText(token.text);
                    const selectionIndex = selectedPositions.indexOf(idx);
                    const isSelected = selectionIndex !== -1;
                    const patchColor = isSelected ? PATCH_COLORS[selectionIndex % PATCH_COLORS.length] : null;
                    
                    return (
                        <span key={`token-${idx}`}>
                            <span
                                data-token-id={idx}
                                data-token-side={side}
                                onClick={(e) => handleTokenClick(e, idx)}
                                onMouseEnter={() => onTokenHover?.(idx)}
                                onMouseLeave={() => onTokenLeave?.()}
                                className={cn(
                                    TOKEN_STYLES.base,
                                    // Show clickable styling when not selected
                                    !isSelected && !loading && TOKEN_STYLES.clickable,
                                    !isSelected && !loading && TOKEN_STYLES.hover,
                                    isSelected && TOKEN_STYLES.selected,
                                    token.text === "\\n" ? "w-full" : "w-fit",
                                    loading ? "cursor-progress" : "cursor-pointer"
                                )}
                                style={isSelected && patchColor ? {
                                    backgroundColor: patchColor.bg,
                                    boxShadow: `inset 0 0 0 2px ${patchColor.ring}`,
                                } : undefined}
                                title={`${label} position ${idx}: "${token.text}"${isSelected ? ` (patch #${selectionIndex + 1})` : ""}`}
                            >
                                {result}
                                {/* Token number badge - commented out as it makes tokens hard to read
                                {isSelected && selectedPositions.length > 1 && patchColor && (
                                    <span 
                                        className="absolute -top-1 -right-1 text-[10px] text-white rounded-full w-4 h-4 flex items-center justify-center font-medium"
                                        style={{ backgroundColor: patchColor.bg }}
                                    >
                                        {selectionIndex + 1}
                                    </span>
                                )}
                                */}
                            </span>
                            {numNewlines > 0 && "\n".repeat(numNewlines)}
                        </span>
                    );
                })
            )}
        </div>
    );
}

// Source token display with range selection support (shift+click)
function SourceTokenDisplay({
    tokens,
    loading,
    selectedPositions,
    pendingRangeStart,
    onTokenClick,
    label,
}: {
    tokens: Token[];
    loading: boolean;
    selectedPositions: SourcePosition[];
    pendingRangeStart: number | null;
    onTokenClick: (pos: number, shiftKey: boolean) => void;
    label: string;
}) {
    const handleTokenClick = (e: React.MouseEvent, idx: number) => {
        e.stopPropagation();
        if (!loading) {
            onTokenClick(idx, e.shiftKey);
        }
    };

    return (
        <div className="w-full custom-scrollbar select-none whitespace-pre-wrap break-words">
            {tokens.length === 0 ? (
                <span className="text-muted-foreground text-sm italic">
                    Enter text and click away to tokenize
                </span>
            ) : (
                tokens.map((token, idx) => {
                    const { result, numNewlines } = fixTokenText(token.text);
                    
                    // Check if this token is part of any selected source position
                    const selection = findSourcePositionForToken(idx, selectedPositions);
                    const isSelected = selection !== null;
                    const selectionIndex = selection?.index ?? -1;
                    const patchColor = isSelected ? PATCH_COLORS[selectionIndex % PATCH_COLORS.length] : null;
                    
                    // Check if this is the pending range start
                    const isPendingStart = pendingRangeStart === idx;
                    
                    // For range selections, determine if this is the first or last token in the range
                    const isRangeStart = selection && typeof selection.pos !== "number" && idx === selection.pos[0];
                    const isRangeEnd = selection && typeof selection.pos !== "number" && idx === selection.pos[1] - 1;
                    const isInRange = selection && typeof selection.pos !== "number";
                    
                    return (
                        <span key={`token-${idx}`}>
                            <span
                                data-token-id={idx}
                                data-token-side="source"
                                onClick={(e) => handleTokenClick(e, idx)}
                                className={cn(
                                    TOKEN_STYLES.base,
                                    !isSelected && !isPendingStart && !loading && TOKEN_STYLES.clickable,
                                    !isSelected && !isPendingStart && !loading && TOKEN_STYLES.hover,
                                    (isSelected || isPendingStart) && TOKEN_STYLES.selected,
                                    token.text === "\\n" ? "w-full" : "w-fit",
                                    loading ? "cursor-progress" : "cursor-pointer",
                                    // Range visual styling - connected tokens
                                    isInRange && !isRangeStart && "rounded-l-none ml-0",
                                    isInRange && !isRangeEnd && "rounded-r-none mr-0"
                                )}
                                style={(isSelected || isPendingStart) ? {
                                    backgroundColor: isPendingStart && !isSelected 
                                        ? PATCH_COLORS[selectedPositions.length % PATCH_COLORS.length].bg
                                        : patchColor?.bg,
                                    boxShadow: `inset 0 0 0 2px ${
                                        isPendingStart && !isSelected 
                                            ? PATCH_COLORS[selectedPositions.length % PATCH_COLORS.length].ring
                                            : patchColor?.ring
                                    }`,
                                    // Dashed border for pending start to indicate "waiting for shift+click"
                                    ...(isPendingStart && !isSelected ? { 
                                        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)' 
                                    } : {})
                                } : undefined}
                                title={`${label} position ${idx}: "${token.text}"${
                                    isSelected ? ` (patch #${selectionIndex + 1}${isInRange ? " - range" : ""})` : ""
                                }${isPendingStart && !isSelected ? " (Shift+click another token to complete range)" : ""}`}
                            >
                                {result}
                            </span>
                            {numNewlines > 0 && "\n".repeat(numNewlines)}
                        </span>
                    );
                })
            )}
        </div>
    );
}

// Prompt section component for reusability (supports multiple selections)
function PromptSection({
    label,
    prompt,
    setPrompt,
    tokens,
    selectedPositions,
    onTokenClick,
    onTokenHover,
    onTokenLeave,
    isEditing,
    setIsEditing,
    onBlur,
    isExecuting,
    tokenizedModel,
    selectedModel,
    textareaRef,
    tokenContainerRef,
    side,
}: {
    label: string;
    prompt: string;
    setPrompt: (value: string) => void;
    tokens: Token[];
    selectedPositions: number[];
    onTokenClick: (pos: number) => void;
    onTokenHover?: (pos: number) => void;
    onTokenLeave?: () => void;
    isEditing: boolean;
    setIsEditing: (value: boolean) => void;
    onBlur: () => void;
    isExecuting: boolean;
    tokenizedModel: string | null;
    selectedModel: string;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    tokenContainerRef: React.RefObject<HTMLDivElement | null>;
    side: "source" | "target";
}) {
    const modelMismatch = tokenizedModel && tokenizedModel !== selectedModel && tokens.length > 0;

    const handleEditClick = useCallback(() => {
        if (isExecuting) return;
        setIsEditing(true);
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                const length = textareaRef.current.value.length;
                textareaRef.current.setSelectionRange(length, length);
            }
        }, 0);
    }, [isExecuting, setIsEditing, textareaRef]);

    // Auto-resize textarea
    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [prompt, isEditing, textareaRef]);

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">{label}</Label>
                {/* Position indicator - commented out for cleaner UI
                {selectedPositions.length > 0 && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <MousePointerClick className="w-3 h-3" />
                        {selectedPositions.length === 1 
                            ? `Position ${selectedPositions[0]}`
                            : `${selectedPositions.length} positions: ${selectedPositions.join(", ")}`
                        }
                    </span>
                )}
                */}
            </div>
            <div className="relative">
                {isEditing ? (
                    <Textarea
                        ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onBlur={onBlur}
                        className="w-full !text-sm bg-input/30 min-h-24 !leading-5"
                        placeholder={`Enter ${label.toLowerCase()} here...`}
                        disabled={isExecuting}
                    />
                ) : (
                    <div
                        ref={tokenContainerRef}
                        className={cn(
                            "flex w-full px-3 py-2 bg-input/30 border rounded min-h-24",
                            isExecuting ? "cursor-progress" : "cursor-text"
                        )}
                        onClick={handleEditClick}
                    >
                        <SelectableTokenDisplay
                            tokens={tokens}
                            loading={isExecuting}
                            selectedPositions={selectedPositions}
                            onTokenClick={(pos) => {
                                // Don't switch to edit mode when clicking a token
                                onTokenClick(pos);
                            }}
                            onTokenHover={onTokenHover}
                            onTokenLeave={onTokenLeave}
                            label={label}
                            side={side}
                        />
                    </div>
                )}

                {/* Model mismatch warning */}
                {modelMismatch && !isExecuting && !isEditing && (
                    <Tooltip>
                        <TooltipTrigger className="absolute bottom-2 right-2">
                            <TriangleAlert className="w-4 h-4 text-destructive/70" />
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                            <p className="w-36 text-wrap text-center">
                                Tokenization does not match the selected model. Please retokenize.
                            </p>
                        </TooltipContent>
                    </Tooltip>
                )}
            </div>
        </div>
    );
}

// Source prompt section with range selection support
function SourcePromptSection({
    label,
    prompt,
    setPrompt,
    tokens,
    selectedPositions,
    pendingRangeStart,
    onTokenClick,
    isEditing,
    setIsEditing,
    onBlur,
    isExecuting,
    tokenizedModel,
    selectedModel,
    textareaRef,
    tokenContainerRef,
}: {
    label: string;
    prompt: string;
    setPrompt: (value: string) => void;
    tokens: Token[];
    selectedPositions: SourcePosition[];
    pendingRangeStart: number | null;
    onTokenClick: (pos: number, shiftKey: boolean) => void;
    isEditing: boolean;
    setIsEditing: (value: boolean) => void;
    onBlur: () => void;
    isExecuting: boolean;
    tokenizedModel: string | null;
    selectedModel: string;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    tokenContainerRef: React.RefObject<HTMLDivElement | null>;
}) {
    const modelMismatch = tokenizedModel && tokenizedModel !== selectedModel && tokens.length > 0;

    const handleEditClick = useCallback(() => {
        if (isExecuting) return;
        setIsEditing(true);
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                const length = textareaRef.current.value.length;
                textareaRef.current.setSelectionRange(length, length);
            }
        }, 0);
    }, [isExecuting, setIsEditing, textareaRef]);

    // Auto-resize textarea
    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [prompt, isEditing, textareaRef]);

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">{label}</Label>
                {pendingRangeStart !== null && (
                    <span className="text-xs text-amber-500 flex items-center gap-1 animate-pulse">
                        Shift+click another token to complete range
                    </span>
                )}
            </div>
            <div className="relative">
                {isEditing ? (
                    <Textarea
                        ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onBlur={onBlur}
                        className="w-full !text-sm bg-input/30 min-h-24 !leading-5"
                        placeholder={`Enter ${label.toLowerCase()} here...`}
                        disabled={isExecuting}
                    />
                ) : (
                    <div
                        ref={tokenContainerRef}
                        className={cn(
                            "flex w-full px-3 py-2 bg-input/30 border rounded min-h-24",
                            isExecuting ? "cursor-progress" : "cursor-text"
                        )}
                        onClick={handleEditClick}
                    >
                        <SourceTokenDisplay
                            tokens={tokens}
                            loading={isExecuting}
                            selectedPositions={selectedPositions}
                            pendingRangeStart={pendingRangeStart}
                            onTokenClick={onTokenClick}
                            label={label}
                        />
                    </div>
                )}

                {/* Model mismatch warning */}
                {modelMismatch && !isExecuting && !isEditing && (
                    <Tooltip>
                        <TooltipTrigger className="absolute bottom-2 right-2">
                            <TriangleAlert className="w-4 h-4 text-destructive/70" />
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                            <p className="w-36 text-wrap text-center">
                                Tokenization does not match the selected model. Please retokenize.
                            </p>
                        </TooltipContent>
                    </Tooltip>
                )}
            </div>
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

    // Source prompt state
    const [srcPrompt, setSrcPrompt] = useState(initialSrcPrompt);
    const [srcTokens, setSrcTokens] = useState<Token[]>([]);
    const [srcPos, setSrcPos] = useState<SourcePosition[]>(initialSrcPos);
    const [srcEditing, setSrcEditing] = useState(!initialSrcPrompt); // Start in view mode if prompt exists
    const [srcTokenizedModel, setSrcTokenizedModel] = useState<string | null>(null);
    const srcTextareaRef = useRef<HTMLTextAreaElement>(null);
    const srcTokenContainerRef = useRef<HTMLDivElement>(null);
    
    // Range selection state for source (shift+click to select range)
    const [pendingRangeStart, setPendingRangeStart] = useState<number | null>(null);

    // Target prompt state
    const [tgtPrompt, setTgtPrompt] = useState(initialTgtPrompt);
    const [tgtTokens, setTgtTokens] = useState<Token[]>([]);
    const [tgtPos, setTgtPos] = useState<number[]>(initialTgtPos);
    const [tgtEditing, setTgtEditing] = useState(!initialTgtPrompt); // Start in view mode if prompt exists
    const [tgtTokenizedModel, setTgtTokenizedModel] = useState<string | null>(null);
    const tgtTextareaRef = useRef<HTMLTextAreaElement>(null);
    const tgtTokenContainerRef = useRef<HTMLDivElement>(null);

    // Arrow connection state
    const controlsContainerRef = useRef<HTMLDivElement>(null);
    const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
    const [hoverTgtIdx, setHoverTgtIdx] = useState<number | null>(null);

    // Show arrows when we have source positions selected (either connecting or connected)
    const showArrows = srcPos.length > 0 && !srcEditing && !tgtEditing;
    // We're in "connecting" mode when source has more selections than target
    const isConnecting = srcPos.length > tgtPos.length && !srcEditing && !tgtEditing;

    // Mutations
    const { mutateAsync: computePatching, isPending: isComputing } = useActivationPatching();
    const { mutateAsync: updateConfig } = useUpdateChartConfig();

    // Only track actual computation for the Run button state
    // Config updates (like saving line selection) should not affect the Run button
    const isExecuting = isComputing;

    // Token line selector state
    const [selectedLineIndices, setSelectedLineIndices] = useState<Set<number>>(
        new Set(initialConfig.data?.selectedLineIndices ?? [0, 1])
    );
    const hasInitializedLinesRef = useRef(false);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const previousDataRef = useRef<string | null>(null);

    // Fetch chart data for token labels (cached by React Query)
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

    // Get token labels from chart data
    const allLabels = useMemo(() => {
        if (!hasChartData || !patchingChart?.data?.tokenLabels) return [];
        return patchingChart.data.tokenLabels;
    }, [hasChartData, patchingChart?.data?.tokenLabels]);

    // Get default selection (first two tokens - source and target predictions)
    const getDefaultSelection = useCallback((numLines: number) => {
        const defaults = new Set<number>();
        if (numLines > 0) defaults.add(0);
        if (numLines > 1) defaults.add(1);
        return defaults;
    }, []);

    const defaultSelection = useMemo(() => {
        const numLines = patchingChart?.data?.lines?.length || 0;
        return getDefaultSelection(numLines);
    }, [patchingChart?.data?.lines?.length, getDefaultSelection]);

    // Create a fingerprint of the data to detect when new results arrive
    const dataFingerprint = useMemo(() => {
        if (!hasChartData || !patchingChart?.data?.tokenLabels) return null;
        return patchingChart.data.tokenLabels.slice(0, 3).join(",");
    }, [hasChartData, patchingChart?.data?.tokenLabels]);

    // Reset to defaults when new data arrives (after a re-run)
    useEffect(() => {
        if (!hasChartData || !patchingChart?.data?.lines) return;
        
        const currentFingerprint = dataFingerprint;
        if (currentFingerprint && previousDataRef.current !== null && previousDataRef.current !== currentFingerprint) {
            // Data changed - reset to default selection (first two tokens)
            const defaultIndices = getDefaultSelection(patchingChart.data.lines.length);
            setSelectedLineIndices(defaultIndices);
            
            // Also save the default selection to config
            updateConfig({
                configId: initialConfig.id,
                chartId,
                config: {
                    data: {
                        ...initialConfig.data,
                        selectedLineIndices: Array.from(defaultIndices),
                    },
                    workspaceId,
                    type: "activation-patching",
                },
            });
        }
        previousDataRef.current = currentFingerprint;
    }, [dataFingerprint, hasChartData, patchingChart?.data?.lines, getDefaultSelection, initialConfig, chartId, workspaceId, updateConfig]);

    // Initialize selection from config when it loads (first load only)
    useEffect(() => {
        if (initialConfig.data?.selectedLineIndices && !hasInitializedLinesRef.current) {
            setSelectedLineIndices(new Set(initialConfig.data.selectedLineIndices));
            hasInitializedLinesRef.current = true;
        } else if (hasChartData && patchingChart?.data?.lines && !hasInitializedLinesRef.current) {
            // Default to first two lines if no saved selection
            const defaultIndices = getDefaultSelection(patchingChart.data.lines.length);
            setSelectedLineIndices(defaultIndices);
            hasInitializedLinesRef.current = true;
        }
    }, [initialConfig.data?.selectedLineIndices, hasChartData, patchingChart?.data?.lines, getDefaultSelection]);

    // Reset initialization flag when chart changes
    useEffect(() => {
        hasInitializedLinesRef.current = false;
        previousDataRef.current = null;
    }, [chartId]);

    // Save selection to config (debounced)
    const saveLineSelection = useCallback((indices: Set<number>) => {
        if (!initialConfig?.id) return;
        
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(() => {
            updateConfig({
                configId: initialConfig.id,
                chartId,
                config: {
                    data: {
                        ...initialConfig.data,
                        selectedLineIndices: Array.from(indices),
                    },
                    workspaceId,
                    type: "activation-patching",
                },
            });
        }, 500);
    }, [initialConfig, chartId, workspaceId, updateConfig]);

    // Handle selection change
    const handleLineSelectionChange = useCallback((indices: number[]) => {
        const newSet = new Set(indices);
        setSelectedLineIndices(newSet);
        saveLineSelection(newSet);
    }, [saveLineSelection]);

    // Sync prompts from config only on initial mount (handled by useState initializers)
    // and when chart ID changes (component remounts due to key={config.id})
    // We don't sync on initialConfig.data changes to avoid race conditions with mutations
    // that could reset local unsaved edits

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
        if (!srcPrompt.trim()) return;
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
    }, [srcPrompt, selectedModel, srcPos, srcTokens]);

    // Handle tokenization for target prompt
    const handleTgtTokenize = useCallback(async () => {
        if (!tgtPrompt.trim()) return;
        const tokens = await encodeText(tgtPrompt, selectedModel);
        if (tokens.length > 0) {
            // Check if tokens actually changed (prompt was modified)
            const tokensChanged = tokens.length !== tgtTokens.length ||
                tokens.some((t, i) => t.text !== tgtTokens[i]?.text);
            
            setTgtTokens(tokens);
            setTgtTokenizedModel(selectedModel);
            setTgtEditing(false);
            
            // Reset positions if tokens changed (prompt was modified)
            if (tokensChanged && tgtPos.length > 0) {
                setTgtPos([]);
            }
        }
    }, [tgtPrompt, selectedModel, tgtPos, tgtTokens]);

    // Handle blur for source
    const handleSrcBlur = useCallback(() => {
        setTimeout(() => {
            const activeElement = document.activeElement;
            const withinTextarea = activeElement && srcTextareaRef.current?.contains(activeElement);
            const withinToken = activeElement && srcTokenContainerRef.current?.contains(activeElement);
            const popoverOpen = document.querySelector("[data-radix-popper-content-wrapper]");

            if (withinTextarea || withinToken || popoverOpen) return;

            if (srcPrompt.trim()) {
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

            if (tgtPrompt.trim()) {
                handleTgtTokenize();
            }
        }, 100);
    }, [tgtPrompt, handleTgtTokenize]);

    // Handle form submission
    const handleSubmit = useCallback(async () => {
        const trimmedSrcPrompt = srcPrompt.trim();
        const trimmedTgtPrompt = tgtPrompt.trim();

        if (!trimmedSrcPrompt || !trimmedTgtPrompt) {
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
        const srcToks = await encodeText(trimmedSrcPrompt, selectedModel);
        const tgtToks = await encodeText(trimmedTgtPrompt, selectedModel);

        if (srcToks.length <= 1 || tgtToks.length <= 1) {
            toast.error("Please enter longer prompts.");
            return;
        }

        setSrcTokens(srcToks);
        setTgtTokens(tgtToks);
        setSrcTokenizedModel(selectedModel);
        setTgtTokenizedModel(selectedModel);

        const config: ActivationPatchingConfigData = {
            ...initialConfig.data,  // Preserve existing fields like selectedLineIndices
            model: selectedModel,
            srcPrompt: trimmedSrcPrompt,
            tgtPrompt: trimmedTgtPrompt,
            srcPos,
            tgtPos,
        };

        // Compute the activation patching visualization
        await computePatching({
            request: {
                completion: config,
                chartId,
            },
            configId: initialConfig.id,
        });

        // Reset selected line indices to defaults after new computation
        // The new data will have new tokens, so we reset to first two (source and target predictions)
        const defaultIndices = new Set([0, 1]);
        setSelectedLineIndices(defaultIndices);
        previousDataRef.current = null; // Clear fingerprint so useEffect can detect new data

        // Update the config in the database with reset line selection
        await updateConfig({
            configId: initialConfig.id,
            chartId,
            config: {
                data: {
                    ...config,
                    selectedLineIndices: [0, 1], // Reset to defaults
                },
                workspaceId,
                type: "activation-patching",
            },
        });

        setSrcEditing(false);
        setTgtEditing(false);
    }, [
        srcPrompt,
        tgtPrompt,
        srcPos,
        tgtPos,
        selectedModel,
        chartId,
        initialConfig.id,
        workspaceId,
        computePatching,
        updateConfig,
    ]);

    // Check if ready to run - requires equal number of source and target positions
    const canRun =
        srcPrompt.trim() &&
        tgtPrompt.trim() &&
        srcPos.length > 0 &&
        tgtPos.length > 0 &&
        srcPos.length === tgtPos.length &&
        !isExecuting;

    // Validation message for unmatched selections
    const validationMessage = useMemo(() => {
        if (srcPos.length === 0 && tgtPos.length === 0) {
            return null;
        }
        if (srcPos.length > tgtPos.length) {
            const diff = srcPos.length - tgtPos.length;
            return `Select ${diff} more target position${diff > 1 ? "s" : ""} to match source`;
        }
        if (tgtPos.length > srcPos.length) {
            const diff = tgtPos.length - srcPos.length;
            return `Select ${diff} more source position${diff > 1 ? "s" : ""} to match target`;
        }
        return null;
    }, [srcPos.length, tgtPos.length]);

    // Mouse move handler for arrow following (only when connecting, not when connected)
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isConnecting) return;
        const container = controlsContainerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        setMousePos({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        });
    }, [isConnecting]);

    // Get token center position relative to container
    // Uses getClientRects() to handle tokens that wrap across multiple lines
    const getTokenCenter = useCallback((side: "source" | "target", index: number, at: "top" | "bottom") => {
        const container = controlsContainerRef.current;
        if (!container) return null;
        const token = container.querySelector<HTMLElement>(
            `[data-token-side="${side}"][data-token-id="${index}"]`,
        );
        if (!token) return null;
        const containerRect = container.getBoundingClientRect();
        
        // Get all line rects for wrapped elements
        const rects = token.getClientRects();
        if (rects.length === 0) return null;
        
        // For "bottom", use the last rect (last line of wrapped token)
        // For "top", use the first rect
        const targetRect = at === "bottom" ? rects[rects.length - 1] : rects[0];
        
        const x = targetRect.left + targetRect.width / 2 - containerRect.left;
        const y = (at === "top" ? targetRect.top : targetRect.bottom) - containerRect.top;
        return { x, y };
    }, []);

    // Get the center position for a source position (handles both single and range)
    const getSourceCenter = useCallback((pos: SourcePosition, at: "top" | "bottom") => {
        if (typeof pos === "number") {
            return getTokenCenter("source", pos, at);
        }
        // For ranges, use the middle token in the range
        // This works better when the range spans multiple lines
        const startIdx = pos[0];
        const endIdx = pos[1] - 1; // end is exclusive, so -1 for last token
        const middleIdx = Math.floor((startIdx + endIdx) / 2);
        return getTokenCenter("source", middleIdx, at);
    }, [getTokenCenter]);

    // Render the connecting arrows (supports multiple connections and ranges)
    const renderArrows = useMemo(() => {
        if (!showArrows || srcPos.length === 0) return null;
        
        const arrows: React.ReactNode[] = [];
        
        // Draw connected arrows (paired source -> target)
        const pairedCount = Math.min(srcPos.length, tgtPos.length);
        for (let i = 0; i < pairedCount; i++) {
            const srcPosition = srcPos[i];
            const start = getSourceCenter(srcPosition, "bottom");
            const end = getTokenCenter("target", tgtPos[i], "top");
            if (!start || !end) continue;
            
            const color = PATCH_COLORS[i % PATCH_COLORS.length].bg;
            arrows.push(
                <g key={`arrow-${i}`}>
                    {/* Glow effect */}
                    <path
                        d={createCurvePath(start, end)}
                        fill="none"
                        stroke={color}
                        strokeWidth={3}
                        strokeOpacity={0.3}
                        filter="url(#arrow-glow)"
                    />
                    {/* Main arrow - solid when connected */}
                    <path
                        d={createCurvePath(start, end)}
                        fill="none"
                        stroke={color}
                        strokeWidth={2}
                        markerEnd={`url(#arrow-head-${i % PATCH_COLORS.length})`}
                    />
                </g>
            );
        }
        
        // Draw "connecting" arrow for the next unpaired source (following mouse/hover)
        if (srcPos.length > tgtPos.length) {
            const unparedSrcPos = srcPos[srcPos.length - 1];
            const start = getSourceCenter(unparedSrcPos, "bottom");
            if (start) {
                let end: { x: number; y: number } | null = null;
                if (hoverTgtIdx !== null) {
                    end = getTokenCenter("target", hoverTgtIdx, "top");
                } else if (mousePos) {
                    end = mousePos;
                }
                
                if (end) {
                    const colorIdx = (srcPos.length - 1) % PATCH_COLORS.length;
                    const color = PATCH_COLORS[colorIdx].bg;
                    arrows.push(
                        <g key="arrow-connecting">
                            {/* Dashed arrow following cursor */}
                            <path
                                d={createCurvePath(start, end)}
                                fill="none"
                                stroke={color}
                                strokeWidth={2}
                                strokeDasharray={hoverTgtIdx !== null ? "none" : "6,4"}
                                markerEnd={`url(#arrow-head-${colorIdx})`}
                                className="transition-all duration-75"
                            />
                        </g>
                    );
                }
            }
        }

        if (arrows.length === 0) return null;

        return (
            <svg className="pointer-events-none absolute inset-0 w-full h-full overflow-visible z-50">
                <defs>
                    {PATCH_COLORS.map((patchColor, idx) => (
                        <marker
                            key={`marker-${idx}`}
                            id={`arrow-head-${idx}`}
                            markerWidth="10"
                            markerHeight="7"
                            refX="9"
                            refY="3.5"
                            orient="auto"
                        >
                            <polygon points="0 0, 10 3.5, 0 7" fill={patchColor.bg} />
                        </marker>
                    ))}
                    {/* Glow filter for the arrows */}
                    <filter id="arrow-glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
                {arrows}
            </svg>
        );
    }, [showArrows, srcPos, tgtPos, hoverTgtIdx, mousePos, getTokenCenter, getSourceCenter]);

    // Clear mouse position when not connecting
    useEffect(() => {
        if (!isConnecting) {
            setMousePos(null);
            setHoverTgtIdx(null);
        }
    }, [isConnecting]);

    // Toggle token selection for source with range support (shift+click)
    // Regular click = add/remove single token
    // Shift+click = start or complete a range selection
    const handleSrcTokenClick = useCallback((pos: number, shiftKey: boolean) => {
        // Check if this token is already part of a selection
        const existingSelection = findSourcePositionForToken(pos, srcPos);
        
        if (existingSelection !== null) {
            // Token is already selected - remove the entire position (single or range)
            const newSrcPos = srcPos.filter((_, i) => i !== existingSelection.index);
            const newTgtPos = tgtPos.filter((_, i) => i !== existingSelection.index);
            setSrcPos(newSrcPos);
            setTgtPos(newTgtPos);
            setPendingRangeStart(null);
            return;
        }
        
        // Token is not selected
        if (shiftKey) {
            // Shift is held - range selection mode
            if (pendingRangeStart !== null) {
                // Complete the range
                const start = Math.min(pendingRangeStart, pos);
                const end = Math.max(pendingRangeStart, pos) + 1; // +1 because end is exclusive
                setSrcPos([...srcPos, [start, end] as [number, number]]);
                setPendingRangeStart(null);
            } else {
                // Start a new range
                setPendingRangeStart(pos);
            }
        } else {
            // Regular click - add as single position immediately
            // Also cancel any pending range
            setPendingRangeStart(null);
            setSrcPos([...srcPos, pos]);
        }
    }, [srcPos, tgtPos, pendingRangeStart]);

    // Toggle token selection for target (add/remove from array)
    // When removing a target, also remove the corresponding source at the same index
    const handleTgtTokenClick = useCallback((pos: number) => {
        const idx = tgtPos.indexOf(pos);
        if (idx !== -1) {
            // Remove this target position and its paired source
            const newTgtPos = tgtPos.filter((_, i) => i !== idx);
            const newSrcPos = srcPos.filter((_, i) => i !== idx);
            setTgtPos(newTgtPos);
            setSrcPos(newSrcPos);
        } else {
            // Only allow adding if we have more source positions than target (pairing mode)
            if (srcPos.length > tgtPos.length) {
                setTgtPos([...tgtPos, pos]);
            }
            // If already balanced, don't add (must add a source first)
        }
    }, [srcPos, tgtPos]);

    return (
        <div 
            ref={controlsContainerRef}
            className="relative flex flex-col gap-6"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setMousePos(null)}
        >
            {/* Arrow SVG overlay */}
            {renderArrows}

            {/* Source Prompt - with range selection support */}
            <SourcePromptSection
                label="Source Prompt"
                prompt={srcPrompt}
                setPrompt={setSrcPrompt}
                tokens={srcTokens}
                selectedPositions={srcPos}
                pendingRangeStart={pendingRangeStart}
                onTokenClick={handleSrcTokenClick}
                isEditing={srcEditing}
                setIsEditing={setSrcEditing}
                onBlur={handleSrcBlur}
                isExecuting={isExecuting}
                tokenizedModel={srcTokenizedModel}
                selectedModel={selectedModel}
                textareaRef={srcTextareaRef}
                tokenContainerRef={srcTokenContainerRef}
            />

            {/* Target Prompt */}
            <PromptSection
                label="Target Prompt"
                prompt={tgtPrompt}
                setPrompt={setTgtPrompt}
                tokens={tgtTokens}
                selectedPositions={tgtPos}
                onTokenClick={handleTgtTokenClick}
                onTokenHover={isConnecting ? setHoverTgtIdx : undefined}
                onTokenLeave={isConnecting ? () => setHoverTgtIdx(null) : undefined}
                isEditing={tgtEditing}
                setIsEditing={setTgtEditing}
                onBlur={handleTgtBlur}
                isExecuting={isExecuting}
                tokenizedModel={tgtTokenizedModel}
                selectedModel={selectedModel}
                textareaRef={tgtTextareaRef}
                tokenContainerRef={tgtTokenContainerRef}
                side="target"
            />

            {/* Validation message - commented out for cleaner UI
            {validationMessage && (
                <div className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 p-2 rounded-md text-center">
                    {validationMessage}
                </div>
            )}
            */}

            {/* Selection summary and clear button */}
            {(srcPos.length > 0 || tgtPos.length > 0) && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                        {srcPos.length === tgtPos.length && srcPos.length > 0
                            ? `${srcPos.length} patch${srcPos.length > 1 ? "es" : ""} ready`
                            : `Source: ${srcPos.length}, Target: ${tgtPos.length}`
                        }
                    </span>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 text-xs px-2"
                        onClick={() => {
                            setSrcPos([]);
                            setTgtPos([]);
                            setPendingRangeStart(null);
                        }}
                        disabled={isExecuting}
                    >
                        <X className="w-3 h-3 mr-1" />
                        Clear
                    </Button>
                </div>
            )}

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
                        {/* {srcPos.length > 0 && tgtPos.length > 0 && srcPos.length === tgtPos.length && (
                            <span className="ml-1 text-violet-200">({srcPos.length} patch{srcPos.length > 1 ? "es" : ""})</span>
                        )} */}
                    </>
                )}
            </Button>

            {/* Token Line Selector - only show when we have chart data */}
            {hasChartData && allLabels.length > 0 && (
                <div className="pt-4">
                    <TokenSelector
                        allLabels={allLabels}
                        selectedIndices={selectedLineIndices}
                        onChange={handleLineSelectionChange}
                        defaultIndices={defaultSelection}
                        disabled={isExecuting}
                    />
                </div>
            )}
        </div>
    );
}
