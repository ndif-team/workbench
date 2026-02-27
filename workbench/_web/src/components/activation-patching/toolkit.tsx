"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Snowflake } from "lucide-react";
import { cn } from "@/lib/utils";
import { encodeText } from "@/actions/tok";
import type { Token } from "@/types/models";
import type { SourcePosition } from "@/types/activationPatching";

// Shared colors for patch arrows and token selection
export const PATCH_COLORS = [
    { bg: "#8b5cf6", ring: "#8b5cf6", hover: "rgba(139, 92, 246, 0.2)", hoverRing: "rgba(139, 92, 246, 0.5)" }, // violet
    { bg: "#f59e0b", ring: "#f59e0b", hover: "rgba(245, 158, 11, 0.2)", hoverRing: "rgba(245, 158, 11, 0.5)" }, // amber
    { bg: "#10b981", ring: "#10b981", hover: "rgba(16, 185, 129, 0.2)", hoverRing: "rgba(16, 185, 129, 0.5)" }, // emerald
    { bg: "#ef4444", ring: "#ef4444", hover: "rgba(239, 68, 68, 0.2)", hoverRing: "rgba(239, 68, 68, 0.5)" },   // red
    { bg: "#ec4899", ring: "#ec4899", hover: "rgba(236, 72, 153, 0.2)", hoverRing: "rgba(236, 72, 153, 0.5)" }, // pink
];

// Freeze color (cyan) for frozen tokens
export const FREEZE_COLOR = { bg: "#06b6d4", ring: "#06b6d4" };

// Token styling constants
export const TOKEN_STYLES = {
    base: "!text-sm !leading-5 whitespace-pre-wrap break-words select-none !box-border relative px-0.5 py-0.5 rounded-sm transition-all",
    clickable: "bg-muted/60 ring-1 ring-border/50 ring-inset",
    hover: "hover:bg-violet-500/20 hover:ring-1 hover:ring-violet-400/50 hover:ring-inset cursor-pointer",
    selected: "ring-2 ring-inset text-white",
} as const;

// Create a smooth bezier curve path between two points
export function createCurvePath(start: { x: number; y: number }, end: { x: number; y: number }): string {
    const midY = (start.y + end.y) / 2;
    const c1 = { x: start.x, y: midY };
    const c2 = { x: end.x, y: midY };
    return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}

// Helper to fix newlines for display
export const fixTokenText = (text: string) => {
    const numNewlines = (text.match(/\n/g) || []).length;
    const result = text
        .replace(/\r\n/g, "\\r\\n")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
    return { result, numNewlines };
};

// Helper to check if a token index is part of a source position (single or range)
export function isTokenInSourcePosition(tokenIdx: number, pos: SourcePosition): boolean {
    if (typeof pos === "number") {
        return tokenIdx === pos;
    }
    return tokenIdx >= pos[0] && tokenIdx < pos[1];
}

// Helper to find which source position (and its index) a token belongs to
export function findSourcePositionForToken(tokenIdx: number, positions: SourcePosition[]): { pos: SourcePosition; index: number } | null {
    for (let i = 0; i < positions.length; i++) {
        if (isTokenInSourcePosition(tokenIdx, positions[i])) {
            return { pos: positions[i], index: i };
        }
    }
    return null;
}

// Helper to get display text for a source position
export function getSourcePositionLabel(pos: SourcePosition): string {
    if (typeof pos === "number") {
        return `${pos}`;
    }
    return `${pos[0]}-${pos[1] - 1}`;
}

// Token display with click-to-select functionality (supports multiple selections and freeze)
export function SelectableTokenDisplay({
    tokens,
    loading,
    selectedPositions,
    frozenPositions = [],
    onTokenClick,
    onTokenHover,
    onTokenLeave,
    label,
    side,
    predictionToken,
    compact = false,
}: {
    tokens: Token[];
    loading: boolean;
    selectedPositions: number[];
    frozenPositions?: number[];
    onTokenClick: (pos: number, ctrlKey: boolean) => void;
    onTokenHover?: (pos: number) => void;
    onTokenLeave?: () => void;
    label: string;
    side: "source" | "target";
    predictionToken?: string | null;
    compact?: boolean;
}) {
    const handleTokenClick = (e: React.MouseEvent, idx: number) => {
        e.stopPropagation();
        if (!loading) {
            onTokenClick(idx, e.ctrlKey || e.metaKey);
        }
    };

    const baseStyles = compact 
        ? "text-sm whitespace-pre-wrap break-words select-none relative px-0.5 py-0.5 rounded-sm transition-all"
        : TOKEN_STYLES.base;

    return (
        <div className="w-full custom-scrollbar select-none whitespace-pre-wrap break-words">
            {tokens.length === 0 ? (
                <span className="text-muted-foreground italic text-sm">
                    {compact ? "Enter a prompt..." : "Enter text and click away to tokenize"}
                </span>
            ) : (
                tokens.map((token, idx) => {
                    const { result, numNewlines } = fixTokenText(token.text);
                    const selectionIndex = selectedPositions.indexOf(idx);
                    const isSelected = selectionIndex !== -1;
                    const isFrozen = frozenPositions.includes(idx);
                    const patchColor = isSelected ? PATCH_COLORS[selectionIndex % PATCH_COLORS.length] : null;
                    
                    let tokenStyle: React.CSSProperties | undefined;
                    if (isFrozen) {
                        tokenStyle = {
                            backgroundColor: "rgba(6, 182, 212, 0.25)",
                            backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 2px, rgba(6, 182, 212, 0.15) 2px, rgba(6, 182, 212, 0.15) 4px)",
                            border: "1.5px dashed #06b6d4",
                            boxShadow: "none",
                        };
                    } else if (isSelected && patchColor) {
                        tokenStyle = {
                            backgroundColor: patchColor.bg,
                            boxShadow: `inset 0 0 0 2px ${patchColor.ring}`,
                        };
                    }
                    
                    let titleText = `${label} position ${idx}: "${token.text}"`;
                    if (isFrozen) {
                        titleText += " (frozen - click to unfreeze)";
                    } else if (isSelected) {
                        titleText += ` (patch #${selectionIndex + 1})`;
                    } else if (side === "target") {
                        titleText += " (Ctrl+click to freeze)";
                    }
                    
                    return (
                        <span key={`token-${idx}`}>
                            <span
                                data-token-id={idx}
                                data-token-side={side}
                                onClick={(e) => handleTokenClick(e, idx)}
                                onMouseEnter={() => onTokenHover?.(idx)}
                                onMouseLeave={() => onTokenLeave?.()}
                                className={cn(
                                    baseStyles,
                                    "group",
                                    !isSelected && !isFrozen && !loading && TOKEN_STYLES.clickable,
                                    !isSelected && !isFrozen && !loading && TOKEN_STYLES.hover,
                                    (isSelected || isFrozen) && TOKEN_STYLES.selected,
                                    token.text === "\\n" ? "w-full" : "w-fit",
                                    loading ? "cursor-progress" : "cursor-pointer"
                                )}
                                style={tokenStyle}
                                title={titleText}
                            >
                                {result}
                                {isFrozen && (
                                    <span className="absolute -top-1.5 -right-1.5 z-10 bg-cyan-500 rounded-full w-3.5 h-3.5 flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                        <Snowflake className="w-2 h-2 text-white" />
                                    </span>
                                )}
                            </span>
                            {numNewlines > 0 && "\n".repeat(numNewlines)}
                        </span>
                    );
                })
            )}
            {predictionToken && tokens.length > 0 && (
                <span
                    className={cn(
                        baseStyles,
                        "cursor-default italic text-zinc-500 dark:text-zinc-400"
                    )}
                    title={`Predicted next token: "${predictionToken}"`}
                >
                    {fixTokenText(predictionToken).result}
                </span>
            )}
        </div>
    );
}

// Source token display with range selection support (shift+click)
export function SourceTokenDisplay({
    tokens,
    loading,
    selectedPositions,
    pendingRangeStart,
    onTokenClick,
    label,
    predictionToken,
    compact = false,
}: {
    tokens: Token[];
    loading: boolean;
    selectedPositions: SourcePosition[];
    pendingRangeStart: number | null;
    onTokenClick: (pos: number, shiftKey: boolean) => void;
    label: string;
    predictionToken?: string | null;
    compact?: boolean;
}) {
    const handleTokenClick = (e: React.MouseEvent, idx: number) => {
        e.stopPropagation();
        if (!loading) {
            onTokenClick(idx, e.shiftKey);
        }
    };

    const baseStyles = compact 
        ? "text-sm whitespace-pre-wrap break-words select-none relative px-0.5 py-0.5 rounded-sm transition-all"
        : TOKEN_STYLES.base;

    return (
        <div className="w-full custom-scrollbar select-none whitespace-pre-wrap break-words">
            {tokens.length === 0 ? (
                <span className="text-muted-foreground italic text-sm">
                    {compact ? "Enter a prompt..." : "Enter text and click away to tokenize"}
                </span>
            ) : (
                tokens.map((token, idx) => {
                    const { result, numNewlines } = fixTokenText(token.text);
                    
                    const selection = findSourcePositionForToken(idx, selectedPositions);
                    const isSelected = selection !== null;
                    const selectionIndex = selection?.index ?? -1;
                    const patchColor = isSelected ? PATCH_COLORS[selectionIndex % PATCH_COLORS.length] : null;
                    
                    const isPendingStart = pendingRangeStart === idx;
                    
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
                                    baseStyles,
                                    !isSelected && !isPendingStart && !loading && TOKEN_STYLES.clickable,
                                    !isSelected && !isPendingStart && !loading && TOKEN_STYLES.hover,
                                    (isSelected || isPendingStart) && TOKEN_STYLES.selected,
                                    token.text === "\\n" ? "w-full" : "w-fit",
                                    loading ? "cursor-progress" : "cursor-pointer",
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
            {predictionToken && tokens.length > 0 && (
                <span
                    className={cn(
                        baseStyles,
                        "cursor-default italic text-zinc-500 dark:text-zinc-400"
                    )}
                    title={`Predicted next token: "${predictionToken}"`}
                >
                    {fixTokenText(predictionToken).result}
                </span>
            )}
        </div>
    );
}

// Arrow SVG component for visualizing patch connections
export function PatchArrows({
    arrows,
    connectingArrow,
    idPrefix = "patch",
}: {
    arrows: { path: string; color: string }[];
    connectingArrow?: { path: string; color: string } | null;
    idPrefix?: string;
}) {
    if (arrows.length === 0 && !connectingArrow) return null;

    return (
        <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
            style={{ overflow: "visible" }}
        >
            <defs>
                {arrows.map((arrow, idx) => (
                    <marker
                        key={`marker-${idx}`}
                        id={`${idPrefix}-arrowhead-${idx}`}
                        markerWidth="6"
                        markerHeight="6"
                        refX="5"
                        refY="3"
                        orient="auto"
                    >
                        <polygon points="0 0, 6 3, 0 6" fill={arrow.color} />
                    </marker>
                ))}
                {connectingArrow && (
                    <marker
                        id={`${idPrefix}-arrowhead-connecting`}
                        markerWidth="6"
                        markerHeight="6"
                        refX="5"
                        refY="3"
                        orient="auto"
                    >
                        <polygon points="0 0, 6 3, 0 6" fill={connectingArrow.color} />
                    </marker>
                )}
            </defs>
            {arrows.map((arrow, idx) => (
                <path
                    key={idx}
                    d={arrow.path}
                    stroke={arrow.color}
                    strokeWidth="2"
                    fill="none"
                    opacity="0.7"
                    markerEnd={`url(#${idPrefix}-arrowhead-${idx})`}
                />
            ))}
            {connectingArrow && (
                <path
                    d={connectingArrow.path}
                    stroke={connectingArrow.color}
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    fill="none"
                    opacity="0.5"
                    markerEnd={`url(#${idPrefix}-arrowhead-connecting)`}
                    className="animate-pulse"
                />
            )}
        </svg>
    );
}

// Hook for managing arrow calculations
export function useArrowCalculations({
    containerRef,
    srcPos,
    tgtPos,
    srcEditing,
    tgtEditing,
    hoverTgtIdx,
}: {
    containerRef: React.RefObject<HTMLDivElement | null>;
    srcPos: number[] | SourcePosition[];
    tgtPos: number[];
    srcEditing: boolean;
    tgtEditing: boolean;
    hoverTgtIdx?: number | null;
}) {
    const [arrows, setArrows] = useState<{ path: string; color: string }[]>([]);
    const [connectingArrow, setConnectingArrow] = useState<{ path: string; color: string } | null>(null);
    const rafRef = useRef<number | null>(null);

    // Update arrows when positions change
    useEffect(() => {
        if (!containerRef.current || srcEditing || tgtEditing) {
            setArrows([]);
            setConnectingArrow(null);
            return;
        }

        const updateArrows = () => {
            const container = containerRef.current;
            if (!container) return;

            const containerRect = container.getBoundingClientRect();
            const newArrows: { path: string; color: string }[] = [];

            // Get first token position for each source position (for ranges, use the first token)
            const getSrcTokenPos = (pos: number | SourcePosition): number => {
                return typeof pos === "number" ? pos : pos[0];
            };

            // Draw arrows for each matched pair
            const numPairs = Math.min(srcPos.length, tgtPos.length);
            for (let i = 0; i < numPairs; i++) {
                const srcTokenPos = getSrcTokenPos(srcPos[i]);
                const srcTokenEl = container.querySelector(`[data-token-id="${srcTokenPos}"][data-token-side="source"]`);
                const tgtTokenEl = container.querySelector(`[data-token-id="${tgtPos[i]}"][data-token-side="target"]`);

                if (srcTokenEl && tgtTokenEl) {
                    const srcRect = srcTokenEl.getBoundingClientRect();
                    const tgtRect = tgtTokenEl.getBoundingClientRect();

                    const start = {
                        x: srcRect.left + srcRect.width / 2 - containerRect.left,
                        y: srcRect.bottom - containerRect.top + 2,
                    };
                    const end = {
                        x: tgtRect.left + tgtRect.width / 2 - containerRect.left,
                        y: tgtRect.top - containerRect.top - 2,
                    };

                    const color = PATCH_COLORS[i % PATCH_COLORS.length].bg;
                    newArrows.push({ path: createCurvePath(start, end), color });
                }
            }

            setArrows(newArrows);
        };

        const timer = setTimeout(updateArrows, 50);
        return () => clearTimeout(timer);
    }, [srcPos, tgtPos, srcEditing, tgtEditing, containerRef]);

    // Update connecting arrow on hover
    useEffect(() => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
        }

        if (hoverTgtIdx === null || hoverTgtIdx === undefined || srcEditing || tgtEditing) {
            setConnectingArrow(null);
            return;
        }

        const container = containerRef.current;
        if (!container) return;

        // Determine which source position we're connecting from
        const connectingFromIdx = tgtPos.length;
        if (connectingFromIdx >= srcPos.length) {
            setConnectingArrow(null);
            return;
        }

        rafRef.current = requestAnimationFrame(() => {
            const containerRect = container.getBoundingClientRect();
            const srcTokenPos = typeof srcPos[connectingFromIdx] === "number" 
                ? srcPos[connectingFromIdx] 
                : (srcPos[connectingFromIdx] as [number, number])[0];
            const srcTokenEl = container.querySelector(`[data-token-id="${srcTokenPos}"][data-token-side="source"]`);
            const tgtTokenEl = container.querySelector(`[data-token-id="${hoverTgtIdx}"][data-token-side="target"]`);

            if (srcTokenEl && tgtTokenEl) {
                const srcRect = srcTokenEl.getBoundingClientRect();
                const tgtRect = tgtTokenEl.getBoundingClientRect();

                const start = {
                    x: srcRect.left + srcRect.width / 2 - containerRect.left,
                    y: srcRect.bottom - containerRect.top + 2,
                };
                const end = {
                    x: tgtRect.left + tgtRect.width / 2 - containerRect.left,
                    y: tgtRect.top - containerRect.top - 2,
                };

                const color = PATCH_COLORS[connectingFromIdx % PATCH_COLORS.length].bg;
                setConnectingArrow({ path: createCurvePath(start, end), color });
            }
        });

        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, [hoverTgtIdx, srcPos, tgtPos, srcEditing, tgtEditing, containerRef]);

    return { arrows, connectingArrow };
}

// ============================================================================
// ENHANCED ARROW RENDERING
// Full-featured arrow component with glow effects and mouse-following
// ============================================================================

export interface EnhancedPatchArrowsProps {
    containerRef: React.RefObject<HTMLDivElement | null>;
    srcPos: SourcePosition[];
    tgtPos: number[];
    srcEditing: boolean;
    tgtEditing: boolean;
    hoverTgtIdx: number | null;
    isConnecting: boolean;
    enableGlow?: boolean;
    enableMouseFollowing?: boolean;
    /** External ref for the mouse-following arrow path - required for useMouseFollowingArrow to work */
    connectingArrowRef?: React.RefObject<SVGPathElement | null>;
}

// Helper to get token center position relative to container
function getTokenCenter(
    container: HTMLElement,
    side: "source" | "target",
    index: number,
    at: "top" | "bottom"
): { x: number; y: number } | null {
    const token = container.querySelector<HTMLElement>(
        `[data-token-side="${side}"][data-token-id="${index}"]`
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
}

// Get the center position for a source position (handles both single and range)
function getSourceCenter(
    container: HTMLElement,
    pos: SourcePosition,
    at: "top" | "bottom"
): { x: number; y: number } | null {
    if (typeof pos === "number") {
        return getTokenCenter(container, "source", pos, at);
    }
    // For ranges, use the middle token in the range
    const startIdx = pos[0];
    const endIdx = pos[1] - 1; // end is exclusive, so -1 for last token
    const middleIdx = Math.floor((startIdx + endIdx) / 2);
    return getTokenCenter(container, "source", middleIdx, at);
}

// Hook for mouse-following arrow (uses RAF for smooth updates)
export function useMouseFollowingArrow({
    containerRef,
    connectingArrowRef,
    isConnecting,
    srcPos,
    tgtPos,
    enabled = true,
}: {
    containerRef: React.RefObject<HTMLDivElement | null>;
    connectingArrowRef: React.RefObject<SVGPathElement | null>;
    isConnecting: boolean;
    srcPos: SourcePosition[];
    tgtPos: number[];
    enabled?: boolean;
}) {
    const rafRef = useRef<number | null>(null);

    // Get the start position for the connecting arrow
    const getConnectingArrowStart = useCallback(() => {
        const container = containerRef.current;
        if (!container || srcPos.length <= tgtPos.length) return null;
        const unpairedSrcPos = srcPos[srcPos.length - 1];
        return getSourceCenter(container, unpairedSrcPos, "bottom");
    }, [containerRef, srcPos, tgtPos]);

    // Mouse move handler - directly updates SVG path without React re-render
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isConnecting || !enabled) return;
        const container = containerRef.current;
        const pathEl = connectingArrowRef.current;
        if (!container || !pathEl) return;

        // Only schedule a new frame if one isn't already pending
        if (rafRef.current !== null) return;

        const clientX = e.clientX;
        const clientY = e.clientY;

        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            const rect = container.getBoundingClientRect();
            const mousePos = {
                x: clientX - rect.left,
                y: clientY - rect.top,
            };

            const start = getConnectingArrowStart();
            if (!start) {
                pathEl.setAttribute("d", "");
                return;
            }

            const path = createCurvePath(start, mousePos);
            pathEl.setAttribute("d", path);
        });
    }, [isConnecting, enabled, containerRef, connectingArrowRef, getConnectingArrowStart]);

    // Hide connecting arrow when mouse leaves
    const handleMouseLeave = useCallback(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        const pathEl = connectingArrowRef.current;
        if (pathEl) {
            pathEl.setAttribute("d", "");
        }
    }, [connectingArrowRef]);

    // Cleanup RAF on unmount
    useEffect(() => {
        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, []);

    // Clear connecting arrow when not connecting
    useEffect(() => {
        if (!isConnecting) {
            const pathEl = connectingArrowRef.current;
            if (pathEl) {
                pathEl.setAttribute("d", "");
            }
        }
    }, [isConnecting, connectingArrowRef]);

    // Initialize arrow to emerge from source when a new source is selected
    // This creates a smooth "emerging" effect instead of showing stale paths
    const prevSrcPosLengthRef = useRef(srcPos.length);
    useEffect(() => {
        const pathEl = connectingArrowRef.current;
        const container = containerRef.current;

        // Detect when a new source was added (srcPos length increased)
        const srcPosIncreased = srcPos.length > prevSrcPosLengthRef.current;
        prevSrcPosLengthRef.current = srcPos.length;

        if (isConnecting && enabled && pathEl && container && srcPosIncreased) {
            // Get the start position of the new unpaired source
            const start = getConnectingArrowStart();
            if (start) {
                // Initialize with a tiny path from source (arrow emerges from source)
                const initialEnd = { x: start.x, y: start.y + 8 };
                const path = createCurvePath(start, initialEnd);
                pathEl.setAttribute("d", path);
            }
        }
    }, [srcPos.length, isConnecting, enabled, connectingArrowRef, containerRef, getConnectingArrowStart]);

    return { handleMouseMove, handleMouseLeave };
}

// Enhanced arrow component with glow effects and mouse-following support
export function EnhancedPatchArrows({
    containerRef,
    srcPos,
    tgtPos,
    srcEditing,
    tgtEditing,
    hoverTgtIdx,
    isConnecting,
    enableGlow = true,
    enableMouseFollowing = true,
    connectingArrowRef: externalConnectingArrowRef,
}: EnhancedPatchArrowsProps) {
    const internalConnectingArrowRef = useRef<SVGPathElement>(null);
    // Use external ref if provided, otherwise use internal
    const connectingArrowRef = externalConnectingArrowRef ?? internalConnectingArrowRef;

    // Force re-render on container resize so arrows reposition
    const [, setResizeTick] = useState(0);
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const observer = new ResizeObserver(() => {
            setResizeTick((t) => t + 1);
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, [containerRef]);

    // Don't show arrows while editing
    const showArrows = srcPos.length > 0 && !srcEditing && !tgtEditing;

    if (!showArrows) return null;

    const container = containerRef.current;
    if (!container) return null;

    const arrows: React.ReactNode[] = [];

    // Draw connected arrows (paired source -> target)
    const pairedCount = Math.min(srcPos.length, tgtPos.length);
    for (let i = 0; i < pairedCount; i++) {
        const srcPosition = srcPos[i];
        const start = getSourceCenter(container, srcPosition, "bottom");
        const end = getTokenCenter(container, "target", tgtPos[i], "top");
        if (!start || !end) continue;

        const color = PATCH_COLORS[i % PATCH_COLORS.length].bg;
        arrows.push(
            <g key={`arrow-${i}`}>
                {/* Glow effect (optional) */}
                {enableGlow && (
                    <path
                        d={createCurvePath(start, end)}
                        fill="none"
                        stroke={color}
                        strokeWidth={3}
                        strokeOpacity={0.3}
                        filter="url(#enhanced-arrow-glow)"
                    />
                )}
                {/* Main arrow - solid when connected */}
                <path
                    d={createCurvePath(start, end)}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    markerEnd={`url(#enhanced-arrow-head-${i % PATCH_COLORS.length})`}
                />
            </g>
        );
    }

    // Draw hover arrow (when hovering over a target token)
    if (srcPos.length > tgtPos.length && hoverTgtIdx !== null) {
        const unpairedSrcPos = srcPos[srcPos.length - 1];
        const start = getSourceCenter(container, unpairedSrcPos, "bottom");
        const end = getTokenCenter(container, "target", hoverTgtIdx, "top");
        if (start && end) {
            const colorIdx = (srcPos.length - 1) % PATCH_COLORS.length;
            const color = PATCH_COLORS[colorIdx].bg;
            arrows.push(
                <g key="arrow-hover">
                    <path
                        d={createCurvePath(start, end)}
                        fill="none"
                        stroke={color}
                        strokeWidth={2}
                        markerEnd={`url(#enhanced-arrow-head-${colorIdx})`}
                    />
                </g>
            );
        }
    }

    // Determine the color for the connecting arrow
    const connectingColorIdx = srcPos.length > tgtPos.length
        ? (srcPos.length - 1) % PATCH_COLORS.length
        : 0;
    const connectingColor = PATCH_COLORS[connectingColorIdx].bg;

    return (
        <svg className="pointer-events-none absolute inset-0 w-full h-full overflow-visible z-50">
            <defs>
                {PATCH_COLORS.map((patchColor, idx) => (
                    <marker
                        key={`marker-${idx}`}
                        id={`enhanced-arrow-head-${idx}`}
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
                {enableGlow && (
                    <filter id="enhanced-arrow-glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                )}
            </defs>
            {arrows}
            {/* Mouse-following arrow - updated via DOM for smooth performance */}
            {enableMouseFollowing && isConnecting && hoverTgtIdx === null && (
                <path
                    ref={connectingArrowRef as React.RefObject<SVGPathElement>}
                    fill="none"
                    stroke={connectingColor}
                    strokeWidth={2}
                    strokeDasharray="6,4"
                    markerEnd={`url(#enhanced-arrow-head-${connectingColorIdx})`}
                />
            )}
        </svg>
    );
}

// ============================================================================
// SHARED HOOK: useActivationPatchingState
// Manages source/target positions, range selection, and validation
// ============================================================================

export interface UseActivationPatchingStateProps {
    srcPos: SourcePosition[];
    setSrcPos: (positions: SourcePosition[]) => void;
    tgtPos: number[];
    setTgtPos: (positions: number[]) => void;
    tgtFreeze: number[];
    setTgtFreeze: (positions: number[]) => void;
}

export interface UseActivationPatchingStateReturn {
    pendingRangeStart: number | null;
    setPendingRangeStart: (pos: number | null) => void;
    handleSrcTokenClick: (pos: number, shiftKey: boolean) => void;
    handleTgtTokenClick: (pos: number, ctrlKey: boolean) => void;
    isConnecting: boolean;
    validationMessage: string | null;
    clearAll: () => void;
}

export function useActivationPatchingState({
    srcPos,
    setSrcPos,
    tgtPos,
    setTgtPos,
    tgtFreeze,
    setTgtFreeze,
}: UseActivationPatchingStateProps): UseActivationPatchingStateReturn {
    const [pendingRangeStart, setPendingRangeStart] = useState<number | null>(null);

    // We're in "connecting" mode when source has more selections than target
    const isConnecting = srcPos.length > tgtPos.length;

    // Validation message for unmatched selections
    const validationMessage = (() => {
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
    })();

    // Handle source token click with range support (shift+click)
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
    }, [srcPos, setSrcPos, tgtPos, setTgtPos, pendingRangeStart]);

    // Handle target token click (add/remove from array)
    // Regular click: patch position pairing (when source has more selections), or unfreeze if frozen
    // Ctrl+click: freeze position (independent of patching)
    const handleTgtTokenClick = useCallback((pos: number, ctrlKey: boolean) => {
        // Check if token is frozen
        const freezeIdx = tgtFreeze.indexOf(pos);
        const isFrozen = freezeIdx !== -1;

        if (ctrlKey) {
            // Ctrl+click: toggle freeze
            if (isFrozen) {
                // Remove from freeze
                setTgtFreeze(tgtFreeze.filter((_, i) => i !== freezeIdx));
            } else {
                // Add to freeze (don't allow freezing a patch position)
                if (!tgtPos.includes(pos)) {
                    setTgtFreeze([...tgtFreeze, pos]);
                }
            }
        } else {
            // Regular click
            // If frozen, unfreeze it
            if (isFrozen) {
                setTgtFreeze(tgtFreeze.filter((_, i) => i !== freezeIdx));
                return;
            }

            // Otherwise handle as patch position
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
        }
    }, [srcPos, setSrcPos, tgtPos, setTgtPos, tgtFreeze, setTgtFreeze]);

    // Clear all selections
    const clearAll = useCallback(() => {
        setSrcPos([]);
        setTgtPos([]);
        setTgtFreeze([]);
        setPendingRangeStart(null);
    }, [setSrcPos, setTgtPos, setTgtFreeze]);

    return {
        pendingRangeStart,
        setPendingRangeStart,
        handleSrcTokenClick,
        handleTgtTokenClick,
        isConnecting,
        validationMessage,
        clearAll,
    };
}

// Compact prompt input component with tokenization
export function CompactPromptInput({
    label,
    prompt,
    setPrompt,
    tokens,
    setTokens,
    selectedPositions,
    frozenPositions = [],
    onTokenClick,
    onTokenHover,
    onTokenLeave,
    selectedModel,
    side,
    disabled = false,
    placeholder,
    isEditing,
    setIsEditing,
    pendingRangeStart,
    compact = false,
}: {
    label: string;
    prompt: string;
    setPrompt: (value: string) => void;
    tokens: Token[];
    setTokens: (tokens: Token[]) => void;
    selectedPositions: number[] | SourcePosition[];
    frozenPositions?: number[];
    onTokenClick: (pos: number, modifierKey: boolean) => void;
    onTokenHover?: (pos: number) => void;
    onTokenLeave?: () => void;
    selectedModel: string;
    side: "source" | "target";
    disabled?: boolean;
    placeholder?: string;
    isEditing: boolean;
    setIsEditing: (value: boolean) => void;
    pendingRangeStart?: number | null;
    compact?: boolean;
}) {
    const [isTokenizing, setIsTokenizing] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleBlur = useCallback(async () => {
        if (!prompt) {
            setTokens([]);
            setIsEditing(false);
            return;
        }

        setIsTokenizing(true);
        setIsEditing(false);
        try {
            const newTokens = await encodeText(prompt, selectedModel);
            setTokens(newTokens);
        } catch (error) {
            console.error("Tokenization error:", error);
            setTokens([]);
        }
        setIsTokenizing(false);
    }, [prompt, selectedModel, setTokens, setIsEditing]);

    const handleContainerClick = useCallback(() => {
        if (disabled || isTokenizing) return;
        setIsEditing(true);
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                const length = textareaRef.current.value.length;
                textareaRef.current.setSelectionRange(length, length);
            }
        }, 0);
    }, [disabled, isTokenizing, setIsEditing]);

    useEffect(() => {
        if (tokens.length > 0 && prompt && !isEditing) {
            handleBlur();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedModel]);

    return (
        <div className="space-y-1">
            <Label className={cn("font-medium text-muted-foreground", compact ? "text-xs" : "text-sm")}>{label}</Label>
            <div className="relative">
                {isEditing ? (
                    <Textarea
                        ref={textareaRef}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onBlur={handleBlur}
                        placeholder={placeholder || `Enter ${label.toLowerCase()}...`}
                        className={cn(
                            "resize-none bg-background/50 border-border/50 focus:border-primary/50 transition-colors",
                            compact ? "min-h-[50px] text-sm" : "min-h-24 !text-sm !leading-5"
                        )}
                        disabled={disabled}
                        autoFocus
                    />
                ) : (
                    <div
                        onClick={handleContainerClick}
                        className={cn(
                            "p-2 bg-background/50 border border-border/50 rounded-md",
                            compact ? "min-h-[50px] max-h-24 overflow-auto" : "min-h-24",
                            disabled || isTokenizing ? "cursor-progress" : "cursor-text"
                        )}
                    >
                        {side === "source" && pendingRangeStart !== undefined ? (
                            <SourceTokenDisplay
                                tokens={tokens}
                                loading={isTokenizing}
                                selectedPositions={selectedPositions as SourcePosition[]}
                                pendingRangeStart={pendingRangeStart}
                                onTokenClick={onTokenClick}
                                label={label}
                                compact={compact}
                            />
                        ) : (
                            <SelectableTokenDisplay
                                tokens={tokens}
                                loading={isTokenizing}
                                selectedPositions={selectedPositions as number[]}
                                frozenPositions={frozenPositions}
                                onTokenClick={onTokenClick}
                                onTokenHover={onTokenHover}
                                onTokenLeave={onTokenLeave}
                                label={label}
                                side={side}
                                compact={compact}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// UNIFIED PROMPT SECTION COMPONENT
// Handles both source (with range selection) and target (with freeze) variants
// Supports compact mode (landing page) and full mode (chart page)
// ============================================================================

export interface PatchPromptSectionProps {
    variant: "source" | "target";
    mode: "compact" | "full";
    label: string;
    prompt: string;
    setPrompt: (value: string) => void;
    tokens: Token[];
    setTokens?: (tokens: Token[]) => void;  // Required for compact mode (auto-tokenize)
    selectedModel: string;
    disabled?: boolean;
    placeholder?: string;
    isEditing: boolean;
    setIsEditing: (value: boolean) => void;
    predictionToken?: string | null;

    // Source variant props
    selectedPositions?: SourcePosition[];  // For source
    pendingRangeStart?: number | null;
    onSrcTokenClick?: (pos: number, shiftKey: boolean) => void;

    // Target variant props
    tgtSelectedPositions?: number[];  // For target
    frozenPositions?: number[];
    onTgtTokenClick?: (pos: number, ctrlKey: boolean) => void;
    onTokenHover?: (pos: number) => void;
    onTokenLeave?: () => void;

    // Full mode props
    isExecuting?: boolean;
    tokenizedModel?: string | null;
    textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
    tokenContainerRef?: React.RefObject<HTMLDivElement | null>;
    onBlur?: () => void;  // External blur handler for full mode
}

export function PatchPromptSection({
    variant,
    mode,
    label,
    prompt,
    setPrompt,
    tokens,
    setTokens,
    selectedModel,
    disabled = false,
    placeholder,
    isEditing,
    setIsEditing,
    predictionToken,
    // Source props
    selectedPositions,
    pendingRangeStart,
    onSrcTokenClick,
    // Target props
    tgtSelectedPositions,
    frozenPositions = [],
    onTgtTokenClick,
    onTokenHover,
    onTokenLeave,
    // Full mode props
    isExecuting = false,
    tokenizedModel,
    textareaRef: externalTextareaRef,
    tokenContainerRef: externalTokenContainerRef,
    onBlur: externalOnBlur,
}: PatchPromptSectionProps) {
    const [isTokenizing, setIsTokenizing] = useState(false);
    const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
    const internalTokenContainerRef = useRef<HTMLDivElement>(null);

    const textareaRef = externalTextareaRef ?? internalTextareaRef;
    const tokenContainerRef = externalTokenContainerRef ?? internalTokenContainerRef;

    const isCompact = mode === "compact";
    const isSource = variant === "source";
    const loading = isExecuting || isTokenizing;

    // Model mismatch warning (full mode only)
    const modelMismatch = tokenizedModel && tokenizedModel !== selectedModel && tokens.length > 0;

    // Internal blur handler for compact mode (auto-tokenize)
    const handleCompactBlur = useCallback(async () => {
        if (!prompt) {
            setTokens?.([]);
            setIsEditing(false);
            return;
        }

        setIsTokenizing(true);
        setIsEditing(false);
        try {
            const newTokens = await encodeText(prompt, selectedModel);
            setTokens?.(newTokens);
        } catch (error) {
            console.error("Tokenization error:", error);
            setTokens?.([]);
        }
        setIsTokenizing(false);
    }, [prompt, selectedModel, setTokens, setIsEditing]);

    // Handle blur - use external for full mode, internal for compact
    const handleBlur = isCompact ? handleCompactBlur : externalOnBlur;

    // Handle container click to enter edit mode
    const handleContainerClick = useCallback(() => {
        if (disabled || loading) return;
        setIsEditing(true);
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                const length = textareaRef.current.value.length;
                textareaRef.current.setSelectionRange(length, length);
            }
        }, 0);
    }, [disabled, loading, setIsEditing, textareaRef]);

    // Re-tokenize on model change for compact mode
    useEffect(() => {
        if (isCompact && tokens.length > 0 && prompt && !isEditing) {
            handleCompactBlur();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isCompact, selectedModel]);

    // Auto-resize textarea (full mode)
    useEffect(() => {
        if (!isCompact && isEditing && textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [prompt, isEditing, textareaRef, isCompact]);

    // Handle token click based on variant
    const handleTokenClick = useCallback((pos: number, modifierKey: boolean) => {
        if (isSource) {
            onSrcTokenClick?.(pos, modifierKey);
        } else {
            onTgtTokenClick?.(pos, modifierKey);
        }
    }, [isSource, onSrcTokenClick, onTgtTokenClick]);

    // Render token display based on variant
    const renderTokenDisplay = () => {
        if (isSource) {
            return (
                <SourceTokenDisplay
                    tokens={tokens}
                    loading={loading}
                    selectedPositions={selectedPositions ?? []}
                    pendingRangeStart={pendingRangeStart ?? null}
                    onTokenClick={handleTokenClick}
                    label={label}
                    predictionToken={predictionToken}
                    compact={isCompact}
                />
            );
        } else {
            return (
                <SelectableTokenDisplay
                    tokens={tokens}
                    loading={loading}
                    selectedPositions={tgtSelectedPositions ?? []}
                    frozenPositions={frozenPositions}
                    onTokenClick={handleTokenClick}
                    onTokenHover={onTokenHover}
                    onTokenLeave={onTokenLeave}
                    label={label}
                    side="target"
                    predictionToken={predictionToken}
                    compact={isCompact}
                />
            );
        }
    };

    return (
        <div className={isCompact ? "" : "flex flex-col gap-2"}>
            {/* Label row - only show for full mode */}
            {!isCompact && (
                <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">
                        {label}
                    </Label>
                    {/* Pending range indicator (source only, full mode) */}
                    {isSource && pendingRangeStart !== null && (
                        <span className="text-xs text-amber-500 flex items-center gap-1 animate-pulse">
                            Shift+click another token to complete range
                        </span>
                    )}
                </div>
            )}
            <div className="relative">
                {isEditing ? (
                    <Textarea
                        ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onBlur={handleBlur}
                        placeholder={placeholder || `Enter ${label.toLowerCase()}...`}
                        className={cn(
                            isCompact
                                ? "resize-none bg-background/50 border-border/50 focus:border-primary/50 transition-colors min-h-[80px] text-sm pr-16"
                                : "w-full !text-sm bg-input/30 min-h-24 !leading-5"
                        )}
                        disabled={disabled || loading}
                        autoFocus
                    />
                ) : (
                    <div
                        ref={tokenContainerRef as React.RefObject<HTMLDivElement>}
                        onClick={handleContainerClick}
                        className={cn(
                            isCompact
                                ? "p-2.5 bg-background/50 border border-border/50 rounded-md min-h-[80px] max-h-32 overflow-auto"
                                : "flex w-full px-3 py-2 bg-input/30 border rounded min-h-24",
                            loading ? "cursor-progress" : "cursor-text"
                        )}
                    >
                        {renderTokenDisplay()}
                    </div>
                )}

                {/* Compact mode label - bottom right overlay */}
                {isCompact && (
                    <span className="absolute bottom-1.5 right-2 text-[10px] font-medium text-muted-foreground/50 pointer-events-none select-none uppercase tracking-wide">
                        {label}
                    </span>
                )}

                {/* Model mismatch warning (full mode only) */}
                {!isCompact && modelMismatch && !loading && !isEditing && (
                    <div className="absolute bottom-2 right-2" title="Tokenization does not match the selected model. Please retokenize.">
                        <span className="text-destructive/70 text-sm">⚠</span>
                    </div>
                )}
            </div>
        </div>
    );
}
