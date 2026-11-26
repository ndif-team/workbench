"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowRightLeft, MoveHorizontal, Snowflake, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { popoverMenuShellClass } from "@/components/ui/pill-popover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { encodeText, useIsTokenizing } from "@/lib/tokenize";
import { PROMPT_FIELD, PROMPT_TOKENS } from "@/components/promptField";
import type { Token } from "@/types/models";
import type { SourcePosition } from "@/types/activationPatching";

// Shared colors for patch arrows and token selection; `fg` is the text color that reads on `bg`
export const PATCH_COLORS = [
    {
        bg: "#8b5cf6",
        fg: "#ffffff",
        ring: "#8b5cf6",
        hover: "rgba(139, 92, 246, 0.2)",
        hoverRing: "rgba(139, 92, 246, 0.5)",
    }, // violet
    {
        bg: "#f59e0b",
        fg: "#171717",
        ring: "#f59e0b",
        hover: "rgba(245, 158, 11, 0.2)",
        hoverRing: "rgba(245, 158, 11, 0.5)",
    }, // amber
    {
        bg: "#10b981",
        fg: "#171717",
        ring: "#10b981",
        hover: "rgba(16, 185, 129, 0.2)",
        hoverRing: "rgba(16, 185, 129, 0.5)",
    }, // emerald
    {
        bg: "#ef4444",
        fg: "#171717",
        ring: "#ef4444",
        hover: "rgba(239, 68, 68, 0.2)",
        hoverRing: "rgba(239, 68, 68, 0.5)",
    }, // red
    {
        bg: "#ec4899",
        fg: "#171717",
        ring: "#ec4899",
        hover: "rgba(236, 72, 153, 0.2)",
        hoverRing: "rgba(236, 72, 153, 0.5)",
    }, // pink
];

/** Patching's tokens: the shared prompt tokens (`PROMPT_TOKENS`), which can also be picked. */
const TOKEN_STYLES = {
    base: cn(PROMPT_FIELD.text, PROMPT_TOKENS.token),
    /** A plain-text prompt's tokens; the mode's look sets their size (`PatchPromptSection.LOOK`). */
    plain: PROMPT_TOKENS.token,
    clickable: PROMPT_TOKENS.outline,
    hover: cn(PROMPT_TOKENS.hover, "cursor-pointer"),
    selected: "ring-2 ring-inset",
} as const;

// Create a smooth bezier curve path between two points
function createCurvePath(start: { x: number; y: number }, end: { x: number; y: number }): string {
    const midY = (start.y + end.y) / 2;
    const c1 = { x: start.x, y: midY };
    const c2 = { x: end.x, y: midY };
    return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}

// Helper to check if a token index is part of a source position (single or range)
function isTokenInSourcePosition(tokenIdx: number, pos: SourcePosition): boolean {
    if (typeof pos === "number") {
        return tokenIdx === pos;
    }
    return tokenIdx >= pos[0] && tokenIdx < pos[1];
}

// Helper to find which source position (and its index) a token belongs to
function findSourcePositionForToken(
    tokenIdx: number,
    positions: SourcePosition[],
): { pos: SourcePosition; index: number } | null {
    for (let i = 0; i < positions.length; i++) {
        if (isTokenInSourcePosition(tokenIdx, positions[i])) {
            return { pos: positions[i], index: i };
        }
    }
    return null;
}

// Token display with click-to-select functionality (supports multiple selections and freeze)
function SelectableTokenDisplay({
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
    tokensClickable = true,
    textClass,
    filler,
    text,
}: {
    /** What a plain-text prompt shows while it has no tokens. */
    filler?: string;
    /** The prompt's text, shown as it is until its tokens arrive. */
    text?: string;
    tokens: Token[];
    loading: boolean;
    selectedPositions: number[];
    frozenPositions?: number[];
    onTokenClick: (pos: number, ctrlKey: boolean) => void;
    /** False when no token-click handler was supplied: clicks bubble to the
     * container instead of being swallowed. */
    tokensClickable?: boolean;
    onTokenHover?: (pos: number) => void;
    onTokenLeave?: () => void;
    label: string;
    side: "source" | "target";
    predictionToken?: string | null;
    /** The composers' tokens (Home's and the phone's), at the size of their text. */
    /** The text size of a plain-text prompt (`PatchPromptSection.LOOK`), which draws no box around its tokens. */
    textClass?: string;
}) {
    const handleTokenClick = (e: React.MouseEvent, idx: number) => {
        // Only claim the click when clicking a token actually does something. With
        // no handler the chips are a read-only rendering of the prompt, and the
        // container's job is to open the editor — swallowing the click there made
        // the middle of your own prompt a dead zone that advertised cursor-text.
        if (!tokensClickable) return;
        e.stopPropagation();
        if (!loading) {
            onTokenClick(idx, e.ctrlKey || e.metaKey);
        }
    };

    const plain = textClass !== undefined;
    const baseStyles = plain ? cn(TOKEN_STYLES.plain, textClass) : TOKEN_STYLES.base;

    return (
        <div className={PROMPT_TOKENS.list}>
            {tokens.length === 0 ? (
                text ? (
                    <span className={cn("whitespace-pre-wrap break-words px-0.5", textClass)}>
                        {text}
                    </span>
                ) : (
                    <span className={cn("text-muted-foreground", textClass ?? "italic text-sm")}>
                        {plain ? filler : "Enter text and click away to tokenize"}
                    </span>
                )
            ) : (
                tokens.map((token, idx) => {
                    const { result, numNewlines } = PROMPT_TOKENS.fixText(token.text);
                    const selectionIndex = selectedPositions.indexOf(idx);
                    const isSelected = selectionIndex !== -1;
                    const isFrozen = frozenPositions.includes(idx);
                    const patchColor = isSelected
                        ? PATCH_COLORS[selectionIndex % PATCH_COLORS.length]
                        : null;

                    let tokenStyle: React.CSSProperties | undefined;
                    if (isFrozen) {
                        tokenStyle = {
                            backgroundColor: "rgba(6, 182, 212, 0.25)",
                            backgroundImage:
                                "repeating-linear-gradient(135deg, transparent, transparent 2px, rgba(6, 182, 212, 0.15) 2px, rgba(6, 182, 212, 0.15) 4px)",
                            border: "1.5px dashed #06b6d4",
                            boxShadow: "none",
                        };
                    } else if (isSelected && patchColor) {
                        tokenStyle = {
                            backgroundColor: patchColor.bg,
                            color: patchColor.fg,
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
                                    loading ? "cursor-progress" : "cursor-pointer",
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
                    className={cn(baseStyles, PROMPT_TOKENS.prediction)}
                    title={`Predicted next token: "${predictionToken}"`}
                >
                    {PROMPT_TOKENS.fixText(predictionToken).result}
                </span>
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
    predictionToken,
    tokensClickable = true,
    textClass,
    filler,
    text,
}: {
    /** What a plain-text prompt shows while it has no tokens. */
    filler?: string;
    /** The prompt's text, shown as it is until its tokens arrive. */
    text?: string;
    tokens: Token[];
    loading: boolean;
    selectedPositions: SourcePosition[];
    pendingRangeStart: number | null;
    onTokenClick: (pos: number, shiftKey: boolean) => void;
    /** False when no token-click handler was supplied: clicks bubble to the
     * container instead of being swallowed. */
    tokensClickable?: boolean;
    label: string;
    predictionToken?: string | null;
    /** The composers' tokens (Home's and the phone's), at the size of their text. */
    /** The text size of a plain-text prompt (`PatchPromptSection.LOOK`), which draws no box around its tokens. */
    textClass?: string;
}) {
    const handleTokenClick = (e: React.MouseEvent, idx: number) => {
        // Only claim the click when clicking a token actually does something. With
        // no handler the chips are a read-only rendering of the prompt, and the
        // container's job is to open the editor — swallowing the click there made
        // the middle of your own prompt a dead zone that advertised cursor-text.
        if (!tokensClickable) return;
        e.stopPropagation();
        if (!loading) {
            onTokenClick(idx, e.shiftKey);
        }
    };

    const plain = textClass !== undefined;
    const baseStyles = plain ? cn(TOKEN_STYLES.plain, textClass) : TOKEN_STYLES.base;

    return (
        <div className={PROMPT_TOKENS.list}>
            {tokens.length === 0 ? (
                text ? (
                    <span className={cn("whitespace-pre-wrap break-words px-0.5", textClass)}>
                        {text}
                    </span>
                ) : (
                    <span className={cn("text-muted-foreground", textClass ?? "italic text-sm")}>
                        {plain ? filler : "Enter text and click away to tokenize"}
                    </span>
                )
            ) : (
                tokens.map((token, idx) => {
                    const { result, numNewlines } = PROMPT_TOKENS.fixText(token.text);

                    const selection = findSourcePositionForToken(idx, selectedPositions);
                    const isSelected = selection !== null;
                    const selectionIndex = selection?.index ?? -1;
                    const patchColor = isSelected
                        ? PATCH_COLORS[selectionIndex % PATCH_COLORS.length]
                        : null;

                    const isPendingStart = pendingRangeStart === idx;

                    const isRangeStart =
                        selection && typeof selection.pos !== "number" && idx === selection.pos[0];
                    const isRangeEnd =
                        selection &&
                        typeof selection.pos !== "number" &&
                        idx === selection.pos[1] - 1;
                    const isInRange = selection && typeof selection.pos !== "number";

                    return (
                        <span key={`token-${idx}`}>
                            <span
                                data-token-id={idx}
                                data-token-side="source"
                                onClick={(e) => handleTokenClick(e, idx)}
                                className={cn(
                                    baseStyles,
                                    !isSelected &&
                                        !isPendingStart &&
                                        !loading &&
                                        TOKEN_STYLES.clickable,
                                    !isSelected &&
                                        !isPendingStart &&
                                        !loading &&
                                        TOKEN_STYLES.hover,
                                    (isSelected || isPendingStart) && TOKEN_STYLES.selected,
                                    token.text === "\\n" ? "w-full" : "w-fit",
                                    loading ? "cursor-progress" : "cursor-pointer",
                                    isInRange && !isRangeStart && "rounded-l-none ml-0",
                                    isInRange && !isRangeEnd && "rounded-r-none mr-0",
                                )}
                                style={
                                    isSelected || isPendingStart
                                        ? {
                                              color: (isPendingStart && !isSelected
                                                  ? PATCH_COLORS[
                                                        selectedPositions.length %
                                                            PATCH_COLORS.length
                                                    ]
                                                  : patchColor
                                              )?.fg,
                                              backgroundColor:
                                                  isPendingStart && !isSelected
                                                      ? PATCH_COLORS[
                                                            selectedPositions.length %
                                                                PATCH_COLORS.length
                                                        ].bg
                                                      : patchColor?.bg,
                                              boxShadow: `inset 0 0 0 2px ${
                                                  isPendingStart && !isSelected
                                                      ? PATCH_COLORS[
                                                            selectedPositions.length %
                                                                PATCH_COLORS.length
                                                        ].ring
                                                      : patchColor?.ring
                                              }`,
                                              ...(isPendingStart && !isSelected
                                                  ? {
                                                        backgroundImage:
                                                            "repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)",
                                                    }
                                                  : {}),
                                          }
                                        : undefined
                                }
                                title={`${label} position ${idx}: "${token.text}"${
                                    isSelected
                                        ? ` (patch #${selectionIndex + 1}${isInRange ? " - range" : ""})`
                                        : ""
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
                    className={cn(baseStyles, PROMPT_TOKENS.prediction)}
                    title={`Predicted next token: "${predictionToken}"`}
                >
                    {PROMPT_TOKENS.fixText(predictionToken).result}
                </span>
            )}
        </div>
    );
}

// ============================================================================
// ENHANCED ARROW RENDERING
// Full-featured arrow component with glow effects and mouse-following
// ============================================================================

interface EnhancedPatchArrowsProps {
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
    at: "top" | "bottom",
): { x: number; y: number } | null {
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

    // A token scrolled out of its prompt area is met at the area's edge.
    const view = token.closest("[data-patch-scroller]")?.getBoundingClientRect();
    const edge = at === "top" ? targetRect.top : targetRect.bottom;
    const x = targetRect.left + targetRect.width / 2 - containerRect.left;
    const y = (view ? Math.min(Math.max(edge, view.top), view.bottom) : edge) - containerRect.top;
    return { x, y };
}

// Get the center position for a source position (handles both single and range)
function getSourceCenter(
    container: HTMLElement,
    pos: SourcePosition,
    at: "top" | "bottom",
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
    const handleMouseMove = useCallback(
        (e: React.MouseEvent) => {
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
        },
        [isConnecting, enabled, containerRef, connectingArrowRef, getConnectingArrowStart],
    );

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
    }, [
        srcPos.length,
        isConnecting,
        enabled,
        connectingArrowRef,
        containerRef,
        getConnectingArrowStart,
    ]);

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

    // Re-render when the container resizes or a prompt inside it scrolls, so arrows reposition
    const [, setResizeTick] = useState(0);
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const reposition = () => setResizeTick((t) => t + 1);
        const observer = new ResizeObserver(reposition);
        observer.observe(container);
        container.addEventListener("scroll", reposition, { capture: true, passive: true });
        return () => {
            observer.disconnect();
            container.removeEventListener("scroll", reposition, { capture: true });
        };
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
            </g>,
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
                </g>,
            );
        }
    }

    // Determine the color for the connecting arrow
    const connectingColorIdx =
        srcPos.length > tgtPos.length ? (srcPos.length - 1) % PATCH_COLORS.length : 0;
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

interface UseActivationPatchingStateProps {
    srcPos: SourcePosition[];
    setSrcPos: (positions: SourcePosition[]) => void;
    tgtPos: number[];
    setTgtPos: (positions: number[]) => void;
    tgtFreeze: number[];
    setTgtFreeze: (positions: number[]) => void;
}

interface UseActivationPatchingStateReturn {
    pendingRangeStart: number | null;
    setPendingRangeStart: (pos: number | null) => void;
    handleSrcTokenClick: (pos: number, shiftKey: boolean) => void;
    handleTgtTokenClick: (pos: number, ctrlKey: boolean) => void;
    isConnecting: boolean;
    validationMessage: string | null;
    clearAll: () => void;
    /** What the next click or tap on a token does (`PatchTools.hint`). */
    hint: string;
    /** `PatchTools`' props, apart from the tokens and `disabled`. */
    patchTools: Omit<PatchToolsProps, "srcTokens" | "tgtTokens" | "disabled">;
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
    const [rangeMode, setRangeMode] = useState(false);
    const [freezeMode, setFreezeMode] = useState(false);

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
    const handleSrcTokenClick = useCallback(
        (pos: number, shiftKey: boolean) => {
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
            if (shiftKey || rangeMode) {
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
        },
        [srcPos, setSrcPos, tgtPos, setTgtPos, pendingRangeStart, rangeMode],
    );

    // Handle target token click (add/remove from array)
    // Regular click: patch position pairing (when source has more selections), or unfreeze if frozen
    // Ctrl+click: freeze position (independent of patching)
    const handleTgtTokenClick = useCallback(
        (pos: number, ctrlKey: boolean) => {
            // Check if token is frozen
            const freezeIdx = tgtFreeze.indexOf(pos);
            const isFrozen = freezeIdx !== -1;

            if (ctrlKey || freezeMode) {
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
        },
        [srcPos, setSrcPos, tgtPos, setTgtPos, tgtFreeze, setTgtFreeze, freezeMode],
    );

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
        hint: PatchTools.hint({ pendingRangeStart, isConnecting, rangeMode, freezeMode }),
        patchTools: {
            srcPos,
            tgtPos,
            tgtFreeze,
            rangeMode,
            onRangeModeChange: (on) => {
                setRangeMode(on);
                setPendingRangeStart(null);
            },
            freezeMode,
            onFreezeModeChange: setFreezeMode,
            onRemove: (index) => {
                const pos = srcPos[index];
                handleSrcTokenClick(typeof pos === "number" ? pos : pos[0], false);
            },
            onClear: clearAll,
        },
    };
}

// ============================================================================
// UNIFIED PROMPT SECTION COMPONENT
// Handles both source (with range selection) and target (with freeze) variants
// Its `mode` picks the look: see PatchPromptSectionProps
// ============================================================================

interface PatchPromptSectionProps {
    variant: "source" | "target";
    /** "full" is Patch Lens's boxed prompt under a label. The others share a
     * look (`PatchPromptSection.LOOK`): plain-text tokens, the label in a
     * corner. "field" is the activation-patching side panel's bordered field;
     * "compact" is Home's composer and "floating" the chart's composer on a
     * phone (`FloatingToolComposer`), neither with a box of its own. "compact"
     * tokenizes its prompt itself and is as tall as its text, up to about six
     * lines, where it scrolls.
     * A "floating" prompt shows one line at rest, scrolled to its
     * first selected token; a few lines, scrolling, while the composer is in
     * use; and up to `30vh` while it is edited, the other prompt back to a line. */
    mode: "compact" | "full" | "floating" | "field";
    label: string;
    prompt: string;
    setPrompt: (value: string) => void;
    tokens: Token[];
    setTokens?: (tokens: Token[]) => void; // Required for compact mode (auto-tokenize)
    selectedModel: string;
    disabled?: boolean;
    placeholder?: string;
    isEditing: boolean;
    setIsEditing: (value: boolean) => void;
    predictionToken?: string | null;

    // Source variant props
    selectedPositions?: SourcePosition[]; // For source
    pendingRangeStart?: number | null;
    onSrcTokenClick?: (pos: number, shiftKey: boolean) => void;

    // Target variant props
    tgtSelectedPositions?: number[]; // For target
    frozenPositions?: number[];
    onTgtTokenClick?: (pos: number, ctrlKey: boolean) => void;
    onTokenHover?: (pos: number) => void;
    onTokenLeave?: () => void;

    // Full mode props
    isExecuting?: boolean;
    tokenizedModel?: string | null;
    textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
    tokenContainerRef?: React.RefObject<HTMLDivElement | null>;
    onBlur?: () => void; // External blur handler for full mode
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
    const awaitingTokens = useIsTokenizing(prompt);
    const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
    const internalTokenContainerRef = useRef<HTMLDivElement>(null);

    const textareaRef = externalTextareaRef ?? internalTextareaRef;
    const tokenContainerRef = externalTokenContainerRef ?? internalTokenContainerRef;

    const isCompact = mode === "compact";
    const isFloating = mode === "floating";
    const look = mode === "full" ? null : PatchPromptSection.LOOK[mode];
    const inComposer = look !== null;
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

    // Grow the textarea with its text; a composer's prompt area scrolls it
    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [prompt, isEditing, textareaRef]);

    // On a phone the prompt rests at one line: keep that line the one holding
    // its first selected token, whenever the area shrinks back or the
    // selection changes while it is at rest.
    const scrollerRef = useRef<HTMLDivElement>(null);
    const firstSelected = !isFloating
        ? Infinity
        : isSource
          ? Math.min(
                ...(selectedPositions ?? []).map((pos) => (typeof pos === "number" ? pos : pos[0])),
            )
          : Math.min(...(tgtSelectedPositions ?? []));
    useEffect(() => {
        const scroller = scrollerRef.current;
        if (!isFloating || !scroller) return;
        const showSelection = () => {
            if (scroller.clientHeight > PatchPromptSection.LINE_PX) return;
            const token = Number.isFinite(firstSelected)
                ? scroller.querySelector<HTMLElement>(`[data-token-id="${firstSelected}"]`)
                : null;
            const line = PatchPromptSection.LINE_PX;
            scroller.scrollTop = token ? Math.floor(token.offsetTop / line) * line : 0;
        };
        showSelection();
        const observer = new ResizeObserver(showSelection);
        observer.observe(scroller);
        return () => observer.disconnect();
    }, [isFloating, firstSelected, isEditing, tokens.length]);

    // Handle token click based on variant
    const handleTokenClick = useCallback(
        (pos: number, modifierKey: boolean) => {
            if (isSource) {
                onSrcTokenClick?.(pos, modifierKey);
            } else {
                onTgtTokenClick?.(pos, modifierKey);
            }
        },
        [isSource, onSrcTokenClick, onTgtTokenClick],
    );

    // Whether clicking a token means anything here. Patch Lens renders the chips
    // read-only, so its clicks must reach the container that opens the editor.
    const tokensClickable = isSource ? !!onSrcTokenClick : !!onTgtTokenClick;

    const filler = placeholder || `Enter ${variant} prompt...`;

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
                    tokensClickable={tokensClickable}
                    label={label}
                    predictionToken={predictionToken}
                    textClass={look?.text}
                    filler={filler}
                    text={prompt}
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
                    tokensClickable={tokensClickable}
                    onTokenHover={onTokenHover}
                    onTokenLeave={onTokenLeave}
                    label={label}
                    side="target"
                    predictionToken={predictionToken}
                    textClass={look?.text}
                    filler={filler}
                    text={prompt}
                />
            );
        }
    };

    return (
        <div className={inComposer ? "" : "flex flex-col gap-2"}>
            {/* Label row: full mode only; the others put the label in a corner */}
            {!inComposer && (
                <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">{label}</Label>
                    {/* Pending range indicator (source only, full mode) */}
                    {isSource && pendingRangeStart !== null && (
                        <span className="text-xs text-amber-500 flex items-center gap-1 animate-pulse">
                            Shift+click another token to complete range
                        </span>
                    )}
                </div>
            )}
            <div
                className={cn(
                    "relative",
                    inComposer && "overflow-y-auto overscroll-contain",
                    look?.area,
                )}
                ref={scrollerRef}
                data-patch-scroller={inComposer || undefined}
            >
                {isEditing ? (
                    <Textarea
                        ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onBlur={handleBlur}
                        placeholder={filler}
                        rows={inComposer ? 1 : undefined}
                        className={cn(
                            inComposer
                                ? "w-full resize-none overflow-hidden rounded-none border-0 bg-transparent pr-16 shadow-none focus-visible:ring-0 dark:bg-transparent"
                                : cn("min-h-24 w-full", PROMPT_FIELD.text, PROMPT_FIELD.textarea),
                            look?.text,
                            look?.textarea,
                            awaitingTokens && PROMPT_FIELD.tokenizing,
                        )}
                        aria-busy={awaitingTokens}
                        disabled={disabled || loading}
                        autoFocus={!isCompact}
                    />
                ) : (
                    <div
                        ref={tokenContainerRef as React.RefObject<HTMLDivElement>}
                        onClick={handleContainerClick}
                        className={cn(
                            look
                                ? cn("w-full", look.tokens)
                                : cn("flex min-h-24 w-full px-3 py-2", PROMPT_FIELD.surface),
                            loading ? "cursor-progress" : "cursor-text",
                            awaitingTokens && PROMPT_FIELD.tokenizing,
                        )}
                        aria-busy={awaitingTokens}
                    >
                        {inComposer && (
                            <span
                                className={cn(
                                    "float-right ml-2 select-none text-xs text-muted-foreground",
                                    look?.labelLeading,
                                )}
                            >
                                {label}
                            </span>
                        )}
                        {renderTokenDisplay()}
                    </div>
                )}

                {inComposer && isEditing && (
                    <span
                        className={cn(
                            "pointer-events-none absolute select-none text-xs text-muted-foreground",
                            look?.labelLeading,
                            look?.label,
                        )}
                    >
                        {label}
                    </span>
                )}

                {/* Model mismatch warning (full mode only) */}
                {!isCompact && modelMismatch && !loading && !isEditing && (
                    <div
                        className="absolute bottom-2 right-2"
                        title="Tokenization does not match the selected model. Please retokenize."
                    >
                        <span className="text-destructive/70 text-sm">⚠</span>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * What sets the modes without a box of their own apart. `text` is the prompt's
 * type, shared by its textarea and its tokens: `PROMPT_FIELD.text`, with
 * Home's growing on large monitors as Home's own prompt does.
 * `labelLeading` keeps the corner label on the first line. The rest is the
 * scrolling area and the paddings.
 */
PatchPromptSection.LOOK = {
    compact: {
        text: cn(
            PROMPT_FIELD.text,
            "!text-base !leading-7 monitor:!text-lg wide:!text-xl wide:!leading-8",
        ),
        labelLeading: "leading-7 wide:leading-8",
        area: "max-h-44 monitor:max-h-52 wide:max-h-60",
        textarea: "min-h-[4.25rem] py-3 pl-4",
        tokens: "min-h-[4.25rem] px-4 py-3",
        label: "right-4 top-3",
    },
    field: {
        text: PROMPT_FIELD.text,
        labelLeading: "leading-6",
        area: cn("max-h-64", PROMPT_FIELD.surface),
        textarea: "min-h-[4.5rem] py-2 pl-3",
        tokens: "min-h-[4.5rem] px-3 py-2",
        label: "right-3 top-2",
    },
    floating: {
        text: PROMPT_FIELD.text,
        labelLeading: "leading-6",
        area: "my-1.5 max-h-6 transition-[max-height] focus-within:!max-h-[30vh] group-data-[active=true]/composer:max-h-24 group-has-[textarea:focus]/composer:max-h-6",
        textarea: "min-h-6 py-0 pl-4",
        tokens: "min-h-6 px-4",
        label: "right-4 top-0",
    },
};

/** A phone composer line's height (px, `leading-6`): its prompt area at rest. */
PatchPromptSection.LINE_PX = 24;

// ============================================================================
// PATCH TOOLS
// The composers' controls for a draft's patches: Home's and the phone's
// ============================================================================

/**
 * The patches and frozen tokens of a draft, by their text: what a composer
 * lists behind its patches button, where there are no arrows to show which
 * source goes where.
 */
function PatchList({
    srcTokens,
    tgtTokens,
    srcPos,
    tgtPos,
    tgtFreeze,
    disabled,
    onRemove,
    onClear,
}: {
    srcTokens: Token[];
    tgtTokens: Token[];
    srcPos: SourcePosition[];
    tgtPos: number[];
    tgtFreeze: number[];
    disabled: boolean;
    /** Removes the patch at this index of `srcPos`. */
    onRemove: (index: number) => void;
    onClear: () => void;
}) {
    const sourceText = (pos: SourcePosition) =>
        (typeof pos === "number" ? [srcTokens[pos]] : srcTokens.slice(pos[0], pos[1]))
            .map((token) => token?.text ?? "")
            .join("")
            .trim();
    const empty = srcPos.length === 0 && tgtFreeze.length === 0;

    return (
        <>
            <div className="flex h-6 items-center justify-between">
                <h3 className="text-xs font-medium text-muted-foreground max-md:text-sm">
                    Patches
                </h3>
                {!empty && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="-mr-1 h-6 px-1.5 text-xs text-muted-foreground max-md:h-8 max-md:px-2 max-md:text-sm"
                        onClick={onClear}
                        disabled={disabled}
                    >
                        Clear all
                    </Button>
                )}
            </div>
            {srcPos.length === 0 ? (
                <p className="text-xs text-muted-foreground max-md:text-sm">
                    Pick a source token, then the target token to patch it into.
                </p>
            ) : (
                <ul className="flex flex-col">
                    {srcPos.map((pos, index) => {
                        const color = PATCH_COLORS[index % PATCH_COLORS.length];
                        const target = tgtTokens[tgtPos[index]]?.text.trim();
                        return (
                            <li
                                key={index}
                                className="flex min-w-0 items-center gap-1.5 text-sm max-md:min-h-11 max-md:gap-2 max-md:text-base"
                            >
                                <span
                                    className="min-w-0 truncate rounded-sm px-1"
                                    style={{ backgroundColor: color.bg, color: color.fg }}
                                >
                                    {sourceText(pos)}
                                </span>
                                <span aria-hidden className="shrink-0 text-muted-foreground">
                                    →
                                </span>
                                {target !== undefined ? (
                                    <span
                                        className="min-w-0 truncate rounded-sm px-1"
                                        style={{ backgroundColor: color.bg, color: color.fg }}
                                    >
                                        {target}
                                    </span>
                                ) : (
                                    <span className="text-xs text-muted-foreground">
                                        pick a target
                                    </span>
                                )}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="-mr-1 ml-auto size-6 max-md:size-9 [&_svg]:size-3.5 max-md:[&_svg]:size-4"
                                    aria-label="Remove patch"
                                    onClick={() => onRemove(index)}
                                    disabled={disabled}
                                >
                                    <X className="text-muted-foreground" />
                                </Button>
                            </li>
                        );
                    })}
                </ul>
            )}
            {tgtFreeze.length > 0 && (
                <p className="flex items-center gap-1 text-xs text-cyan-700 dark:text-cyan-400 max-md:text-sm">
                    <Snowflake className="size-3 shrink-0 max-md:size-3.5" />
                    {tgtFreeze
                        .slice()
                        .sort((a, b) => a - b)
                        .map((pos) => tgtTokens[pos]?.text.trim() ?? pos)
                        .join(", ")}
                </p>
            )}
        </>
    );
}

interface PatchToolsProps {
    srcTokens: Token[];
    tgtTokens: Token[];
    srcPos: SourcePosition[];
    tgtPos: number[];
    tgtFreeze: number[];
    /** While on, a click on a source token starts or ends a range (Shift+click). */
    rangeMode: boolean;
    onRangeModeChange: (on: boolean) => void;
    /** While on, a click on a target token freezes it (⌘/Ctrl+click). */
    freezeMode: boolean;
    onFreezeModeChange: (on: boolean) => void;
    disabled: boolean;
    /** Removes the patch at this index of `srcPos`. */
    onRemove: (index: number) => void;
    onClear: () => void;
}

/**
 * A composer's patch controls, as toolbar buttons: the patches so far (a count
 * that opens `PatchList`), and two toggles that make a plain click or tap do
 * what Shift+click and ⌘/Ctrl+click do, for a touch screen and for anyone who
 * doesn't know the modifiers. `PatchTools.hint` words the next step.
 */
export function PatchTools({
    srcTokens,
    tgtTokens,
    srcPos,
    tgtPos,
    tgtFreeze,
    rangeMode,
    onRangeModeChange,
    freezeMode,
    onFreezeModeChange,
    disabled,
    onRemove,
    onClear,
}: PatchToolsProps) {
    const patchCount = Math.min(srcPos.length, tgtPos.length);
    const toggleClass = "aria-pressed:bg-tool-accent/15 aria-pressed:text-tool-accent";

    return (
        <>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="control"
                        className="px-2 tabular-nums text-muted-foreground"
                        aria-label={`Patches (${patchCount})`}
                    >
                        <ArrowRightLeft />
                        {patchCount}
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    side="top"
                    align="start"
                    className={cn(
                        popoverMenuShellClass(false),
                        "flex w-56 flex-col gap-1.5 px-3 py-2 max-md:w-72",
                    )}
                >
                    <PatchList
                        srcTokens={srcTokens}
                        tgtTokens={tgtTokens}
                        srcPos={srcPos}
                        tgtPos={tgtPos}
                        tgtFreeze={tgtFreeze}
                        disabled={disabled}
                        onRemove={onRemove}
                        onClear={onClear}
                    />
                </PopoverContent>
            </Popover>
            <Button
                type="button"
                variant="ghost"
                size="control-icon"
                className={toggleClass}
                aria-pressed={rangeMode}
                aria-label="Select a range of source tokens"
                title="Select a range of source tokens"
                disabled={disabled}
                onClick={() => onRangeModeChange(!rangeMode)}
            >
                <MoveHorizontal className={cn(!rangeMode && "text-muted-foreground")} />
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="control-icon"
                className={toggleClass}
                aria-pressed={freezeMode}
                aria-label="Freeze target tokens"
                title="Freeze target tokens"
                disabled={disabled}
                onClick={() => onFreezeModeChange(!freezeMode)}
            >
                <Snowflake className={cn(!freezeMode && "text-muted-foreground")} />
            </Button>
        </>
    );
}

/** What the next click or tap on a token does, or "" when nothing is under way. */
PatchTools.hint = ({
    pendingRangeStart,
    isConnecting,
    rangeMode,
    freezeMode,
}: {
    pendingRangeStart: number | null;
    isConnecting: boolean;
    rangeMode: boolean;
    freezeMode: boolean;
}): string => {
    if (pendingRangeStart !== null) return "Pick the range's end";
    if (isConnecting) return freezeMode ? "Turn off freeze first" : "Pick a target";
    if (rangeMode) return "Pick the range's start";
    if (freezeMode) return "Pick tokens to freeze";
    return "";
};
