"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Play, TriangleAlert, MousePointerClick } from "lucide-react";
import { useActivationPatching } from "@/lib/api/activationPatchingApi";
import { useUpdateChartConfig } from "@/lib/api/configApi";
import { ActivationPatchingConfigData } from "@/types/activationPatching";
import { encodeText } from "@/actions/tok";
import { Token } from "@/types/models";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

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

// Token styling constants
const TOKEN_STYLES = {
    base: "!text-sm !leading-5 whitespace-pre-wrap break-words select-none !box-border relative px-0.5 py-0.5 rounded-sm transition-all",
    clickable: "bg-muted/60 ring-1 ring-border/50 ring-inset",
    hover: "hover:bg-violet-500/20 hover:ring-1 hover:ring-violet-400/50 hover:ring-inset cursor-pointer",
    selected: "bg-violet-500 ring-2 ring-violet-500 ring-inset text-white",
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

// Token display with click-to-select functionality
function SelectableTokenDisplay({
    tokens,
    loading,
    selectedPos,
    onTokenClick,
    onTokenHover,
    onTokenLeave,
    label,
    side,
}: {
    tokens: Token[];
    loading: boolean;
    selectedPos: number | null;
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
                    const isSelected = selectedPos === idx;
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
                                    !loading && TOKEN_STYLES.hover,
                                    isSelected && TOKEN_STYLES.selected,
                                    token.text === "\\n" ? "w-full" : "w-fit",
                                    loading ? "cursor-progress" : "cursor-pointer"
                                )}
                                title={`${label} position ${idx}: "${token.text}"`}
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

// Prompt section component for reusability
function PromptSection({
    label,
    prompt,
    setPrompt,
    tokens,
    selectedPos,
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
    selectedPos: number | null;
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
                {selectedPos !== null && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <MousePointerClick className="w-3 h-3" />
                        Token Position {selectedPos}
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
                        <SelectableTokenDisplay
                            tokens={tokens}
                            loading={isExecuting}
                            selectedPos={selectedPos}
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

export function ActivationPatchingControls({
    initialConfig,
    selectedModel,
    hasExistingData = false,
}: ActivationPatchingControlsProps) {
    const { workspaceId, chartId } = useParams<{ workspaceId: string; chartId: string }>();

    // Get initial values from config with fallbacks
    const initialSrcPrompt = initialConfig.data?.srcPrompt ?? "";
    const initialTgtPrompt = initialConfig.data?.tgtPrompt ?? "";
    const initialSrcPos = initialConfig.data?.srcPos ?? null;
    const initialTgtPos = initialConfig.data?.tgtPos ?? null;

    // Source prompt state
    const [srcPrompt, setSrcPrompt] = useState(initialSrcPrompt);
    const [srcTokens, setSrcTokens] = useState<Token[]>([]);
    const [srcPos, setSrcPos] = useState<number | null>(initialSrcPos);
    const [srcEditing, setSrcEditing] = useState(!initialSrcPrompt); // Start in view mode if prompt exists
    const [srcTokenizedModel, setSrcTokenizedModel] = useState<string | null>(null);
    const srcTextareaRef = useRef<HTMLTextAreaElement>(null);
    const srcTokenContainerRef = useRef<HTMLDivElement>(null);
    const lastSyncedSrcPromptRef = useRef<string>(initialSrcPrompt);

    // Target prompt state
    const [tgtPrompt, setTgtPrompt] = useState(initialTgtPrompt);
    const [tgtTokens, setTgtTokens] = useState<Token[]>([]);
    const [tgtPos, setTgtPos] = useState<number | null>(initialTgtPos);
    const [tgtEditing, setTgtEditing] = useState(!initialTgtPrompt); // Start in view mode if prompt exists
    const [tgtTokenizedModel, setTgtTokenizedModel] = useState<string | null>(null);
    const tgtTextareaRef = useRef<HTMLTextAreaElement>(null);
    const tgtTokenContainerRef = useRef<HTMLDivElement>(null);
    const lastSyncedTgtPromptRef = useRef<string>(initialTgtPrompt);

    // Arrow connection state
    const controlsContainerRef = useRef<HTMLDivElement>(null);
    const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
    const [hoverTgtIdx, setHoverTgtIdx] = useState<number | null>(null);

    // Show arrow when source is selected (either connecting or connected)
    const showArrow = srcPos !== null && !srcEditing && !tgtEditing;
    // Arrow is "connecting" when source is selected but target is not yet
    const isConnecting = srcPos !== null && tgtPos === null && !srcEditing && !tgtEditing;

    // Mutations
    const { mutateAsync: computePatching, isPending: isComputing } = useActivationPatching();
    const { mutateAsync: updateConfig, isPending: isUpdatingConfig } = useUpdateChartConfig();

    const isExecuting = isComputing || isUpdatingConfig;

    // Track if both tokens have been selected at least once (for auto-run logic)
    // If existing data is present, we've already run once (from a previous session)
    const hasRunOnceRef = useRef(hasExistingData);
    const prevSrcPosRef = useRef<number | null>(hasExistingData ? (initialConfig.data?.srcPos ?? null) : null);
    const prevTgtPosRef = useRef<number | null>(hasExistingData ? (initialConfig.data?.tgtPos ?? null) : null);

    // Sync prompts from config (only when they actually change)
    useEffect(() => {
        const configSrcPrompt = initialConfig.data?.srcPrompt || "";
        if (configSrcPrompt && configSrcPrompt !== lastSyncedSrcPromptRef.current) {
            setSrcPrompt(configSrcPrompt);
            lastSyncedSrcPromptRef.current = configSrcPrompt;
        }
        const configTgtPrompt = initialConfig.data?.tgtPrompt || "";
        if (configTgtPrompt && configTgtPrompt !== lastSyncedTgtPromptRef.current) {
            setTgtPrompt(configTgtPrompt);
            lastSyncedTgtPromptRef.current = configTgtPrompt;
        }
        // Note: Positions are initialized from initialConfig in useState, 
        // no need to sync them here as that would trigger auto-run on reload
    }, [initialConfig.data]);

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
            
            // Reset position if tokens changed (prompt was modified)
            if (tokensChanged && srcPos !== null) {
                setSrcPos(null);
                // Also reset the previous position ref to avoid stale comparisons
                prevSrcPosRef.current = null;
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
            
            // Reset position if tokens changed (prompt was modified)
            if (tokensChanged && tgtPos !== null) {
                setTgtPos(null);
                // Also reset the previous position ref to avoid stale comparisons
                prevTgtPosRef.current = null;
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

        if (srcPos === null || tgtPos === null) {
            toast.error("Please select a token position in both prompts.");
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

        // Update the config in the database
        await updateConfig({
            configId: initialConfig.id,
            chartId,
            config: {
                data: config,
                workspaceId,
                type: "activation-patching",
            },
        });

        lastSyncedSrcPromptRef.current = trimmedSrcPrompt;
        lastSyncedTgtPromptRef.current = trimmedTgtPrompt;
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

    // Check if ready to run
    const canRun =
        srcPrompt.trim() &&
        tgtPrompt.trim() &&
        srcPos !== null &&
        tgtPos !== null &&
        !isExecuting;

    // Auto-run when both tokens are selected for the first time, or when selection changes
    useEffect(() => {
        // Skip if either position is null or if we're already executing
        if (srcPos === null || tgtPos === null || isExecuting) {
            return;
        }

        // Skip if prompts are empty or not tokenized
        if (!srcPrompt.trim() || !tgtPrompt.trim() || srcTokens.length === 0 || tgtTokens.length === 0) {
            return;
        }

        const srcPosChanged = prevSrcPosRef.current !== srcPos;
        const tgtPosChanged = prevTgtPosRef.current !== tgtPos;

        // First time both are selected
        if (!hasRunOnceRef.current) {
            hasRunOnceRef.current = true;
            prevSrcPosRef.current = srcPos;
            prevTgtPosRef.current = tgtPos;
            handleSubmit();
            return;
        }

        // Subsequent selection changes (only if one of the positions actually changed)
        if (srcPosChanged || tgtPosChanged) {
            prevSrcPosRef.current = srcPos;
            prevTgtPosRef.current = tgtPos;
            handleSubmit();
        }
    }, [srcPos, tgtPos, srcPrompt, tgtPrompt, srcTokens.length, tgtTokens.length, isExecuting, handleSubmit]);

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
    const getTokenCenter = useCallback((side: "source" | "target", index: number, at: "top" | "bottom") => {
        const container = controlsContainerRef.current;
        if (!container) return null;
        const token = container.querySelector<HTMLElement>(
            `[data-token-side="${side}"][data-token-id="${index}"]`,
        );
        if (!token) return null;
        const tokenRect = token.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const x = tokenRect.left + tokenRect.width / 2 - containerRect.left;
        const y = (at === "top" ? tokenRect.top : tokenRect.bottom) - containerRect.top;
        return { x, y };
    }, []);

    // Render the connecting arrow
    const renderArrow = useMemo(() => {
        if (!showArrow || srcPos === null) return null;
        
        const start = getTokenCenter("source", srcPos, "bottom");
        if (!start) return null;

        let end: { x: number; y: number } | null = null;
        let isConnected = false;

        // If target is already selected, draw to it (persistent connection)
        if (tgtPos !== null) {
            end = getTokenCenter("target", tgtPos, "top");
            isConnected = true;
        } 
        // Otherwise, draw to hover target or mouse position (connecting state)
        else if (hoverTgtIdx !== null) {
            end = getTokenCenter("target", hoverTgtIdx, "top");
        } else if (mousePos) {
            end = mousePos;
        }

        if (!end) return null;

        return (
            <svg className="pointer-events-none absolute inset-0 w-full h-full overflow-visible z-50">
                <defs>
                    <marker
                        id="arrow-head"
                        markerWidth="10"
                        markerHeight="7"
                        refX="9"
                        refY="3.5"
                        orient="auto"
                    >
                        <polygon points="0 0, 10 3.5, 0 7" fill="#8b5cf6" />
                    </marker>
                    {/* Glow filter for the arrow */}
                    <filter id="arrow-glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
                {/* Glow effect */}
                <path
                    d={createCurvePath(start, end)}
                    fill="none"
                    stroke="#8b5cf6"
                    strokeWidth={3}
                    strokeOpacity={0.3}
                    filter="url(#arrow-glow)"
                />
                {/* Main arrow - solid when connected or hovering, dashed when following mouse */}
                <path
                    d={createCurvePath(start, end)}
                    fill="none"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    strokeDasharray={isConnected || hoverTgtIdx !== null ? "none" : "6,4"}
                    markerEnd="url(#arrow-head)"
                    className="transition-all duration-75"
                />
            </svg>
        );
    }, [showArrow, srcPos, tgtPos, hoverTgtIdx, mousePos, getTokenCenter]);

    // Clear mouse position when not connecting
    useEffect(() => {
        if (!isConnecting) {
            setMousePos(null);
            setHoverTgtIdx(null);
        }
    }, [isConnecting]);

    return (
        <div 
            ref={controlsContainerRef}
            className="relative flex flex-col gap-6"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setMousePos(null)}
        >
            {/* Arrow SVG overlay */}
            {renderArrow}

            {/* Source Prompt */}
            <PromptSection
                label="Source Prompt"
                prompt={srcPrompt}
                setPrompt={setSrcPrompt}
                tokens={srcTokens}
                selectedPos={srcPos}
                onTokenClick={(pos) => setSrcPos(pos === srcPos ? null : pos)}
                isEditing={srcEditing}
                setIsEditing={setSrcEditing}
                onBlur={handleSrcBlur}
                isExecuting={isExecuting}
                tokenizedModel={srcTokenizedModel}
                selectedModel={selectedModel}
                textareaRef={srcTextareaRef}
                tokenContainerRef={srcTokenContainerRef}
                side="source"
            />

            {/* Target Prompt */}
            <PromptSection
                label="Target Prompt"
                prompt={tgtPrompt}
                setPrompt={setTgtPrompt}
                tokens={tgtTokens}
                selectedPos={tgtPos}
                onTokenClick={(pos) => setTgtPos(pos === tgtPos ? null : pos)}
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

            {/* Instructions */}
            {/* <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-md">
                <p className="font-medium mb-1">How to use:</p>
                <ol className="list-decimal list-inside space-y-1">
                    <li>Enter a source and target prompt</li>
                    <li>Click away to tokenize each prompt</li>
                    <li>Click on a token in each prompt to select the patching positions</li>
                    <li>Computation runs automatically when both tokens are selected</li>
                </ol>
            </div> */}

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

            {/* Auto-run hint */}
            <p className="text-xs text-muted-foreground text-center">
                Auto-runs when both tokens are selected or changed
            </p>
        </div>
    );
}
