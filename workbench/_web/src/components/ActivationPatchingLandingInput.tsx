"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { Token } from "@/types/models";
import type { SourcePosition } from "@/types/activationPatching";
import {
    useActivationPatchingState,
    PatchPromptSection,
    EnhancedPatchArrows,
    useMouseFollowingArrow,
} from "@/components/activation-patching/toolkit";

interface ActivationPatchingLandingInputProps {
    srcPrompt: string;
    setSrcPrompt: (value: string) => void;
    tgtPrompt: string;
    setTgtPrompt: (value: string) => void;
    srcTokens: Token[];
    setSrcTokens: (tokens: Token[]) => void;
    tgtTokens: Token[];
    setTgtTokens: (tokens: Token[]) => void;
    srcPos: SourcePosition[];
    setSrcPos: (positions: SourcePosition[]) => void;
    tgtPos: number[];
    setTgtPos: (positions: number[]) => void;
    tgtFreeze: number[];
    setTgtFreeze: (positions: number[]) => void;
    selectedModel: string;
    disabled?: boolean;
}

export function ActivationPatchingLandingInput({
    srcPrompt,
    setSrcPrompt,
    tgtPrompt,
    setTgtPrompt,
    srcTokens,
    setSrcTokens,
    tgtTokens,
    setTgtTokens,
    srcPos,
    setSrcPos,
    tgtPos,
    setTgtPos,
    tgtFreeze,
    setTgtFreeze,
    selectedModel,
    disabled = false,
}: ActivationPatchingLandingInputProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const connectingArrowRef = useRef<SVGPathElement>(null);
    const [srcEditing, setSrcEditing] = useState(!srcPrompt.trim());
    const [tgtEditing, setTgtEditing] = useState(!tgtPrompt.trim());
    const [hoverTgtIdx, setHoverTgtIdx] = useState<number | null>(null);

    // Use shared hook for state management
    const {
        pendingRangeStart,
        setPendingRangeStart,
        handleSrcTokenClick,
        handleTgtTokenClick,
        isConnecting,
    } = useActivationPatchingState({
        srcPos,
        setSrcPos,
        tgtPos,
        setTgtPos,
        tgtFreeze,
        setTgtFreeze,
    });

    // Use shared hook for mouse-following arrow
    const { handleMouseMove, handleMouseLeave } = useMouseFollowingArrow({
        containerRef,
        connectingArrowRef,
        isConnecting: isConnecting && !srcEditing && !tgtEditing,
        srcPos,
        tgtPos,
        enabled: true,
    });

    // Clear positions when tokens change
    useEffect(() => {
        // Filter out positions that are no longer valid
        const validSrcPos = srcPos.filter(pos => {
            if (typeof pos === "number") {
                return pos < srcTokens.length;
            }
            return pos[0] < srcTokens.length && pos[1] <= srcTokens.length;
        });
        if (validSrcPos.length !== srcPos.length) {
            setSrcPos(validSrcPos);
            setPendingRangeStart(null);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [srcTokens.length]);

    useEffect(() => {
        const validTgtPos = tgtPos.filter(p => p < tgtTokens.length);
        const validTgtFreeze = tgtFreeze.filter(p => p < tgtTokens.length);
        if (validTgtPos.length !== tgtPos.length) {
            setTgtPos(validTgtPos);
        }
        if (validTgtFreeze.length !== tgtFreeze.length) {
            setTgtFreeze(validTgtFreeze);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tgtTokens.length]);

    // Clear stale hover when source selections change (e.g. new source added after pairing)
    // Without this, adding a second source would snap an arrow to the previously hovered target
    useEffect(() => {
        setHoverTgtIdx(null);
    }, [srcPos.length]);

    // Show arrows when we have source positions selected
    const showArrows = srcPos.length > 0 && !srcEditing && !tgtEditing;

    return (
        <div
            ref={containerRef}
            className="space-y-2 relative"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            {/* Arrow SVG overlay */}
            {showArrows && (
                <EnhancedPatchArrows
                    containerRef={containerRef}
                    srcPos={srcPos}
                    tgtPos={tgtPos}
                    srcEditing={srcEditing}
                    tgtEditing={tgtEditing}
                    hoverTgtIdx={hoverTgtIdx}
                    isConnecting={isConnecting && !srcEditing && !tgtEditing}
                    enableGlow={false}
                    enableMouseFollowing={true}
                    connectingArrowRef={connectingArrowRef}
                />
            )}

            {/* Source Prompt */}
            <PatchPromptSection
                variant="source"
                mode="compact"
                label="Source"
                prompt={srcPrompt}
                setPrompt={setSrcPrompt}
                tokens={srcTokens}
                setTokens={setSrcTokens}
                selectedModel={selectedModel}
                disabled={disabled}
                placeholder="Enter source prompt..."
                isEditing={srcEditing}
                setIsEditing={setSrcEditing}
                selectedPositions={srcPos}
                pendingRangeStart={pendingRangeStart}
                onSrcTokenClick={handleSrcTokenClick}
            />

            {/* Target Prompt */}
            <PatchPromptSection
                variant="target"
                mode="compact"
                label="Target"
                prompt={tgtPrompt}
                setPrompt={setTgtPrompt}
                tokens={tgtTokens}
                setTokens={setTgtTokens}
                selectedModel={selectedModel}
                disabled={disabled}
                placeholder="Enter target prompt..."
                isEditing={tgtEditing}
                setIsEditing={setTgtEditing}
                tgtSelectedPositions={tgtPos}
                frozenPositions={tgtFreeze}
                onTgtTokenClick={handleTgtTokenClick}
                onTokenHover={isConnecting && !srcEditing && !tgtEditing ? setHoverTgtIdx : undefined}
                onTokenLeave={isConnecting && !srcEditing && !tgtEditing ? () => setHoverTgtIdx(null) : undefined}
            />

            {/* Status row - compact hints and status in one line */}
            <div className="flex items-center justify-between text-[10px]">
                {/* Hints */}
                <div className="flex items-center gap-3 text-muted-foreground/70">
                    {!srcEditing && srcTokens.length > 0 && (
                        <span><span className="font-medium">Shift</span> for range</span>
                    )}
                    {!tgtEditing && tgtTokens.length > 0 && (
                        <span><span className="font-medium">⌘/Ctrl</span> to freeze</span>
                    )}
                </div>

                {/* Status indicators */}
                <div className="flex items-center gap-2">
                    {tgtFreeze.length > 0 && (
                        <span className="text-cyan-600 dark:text-cyan-400">
                            ❄ {tgtFreeze.length}
                        </span>
                    )}
                    {srcPos.length > 0 && (
                        <span className={cn(
                            srcPos.length === tgtPos.length 
                                ? "text-emerald-600 dark:text-emerald-400" 
                                : "text-amber-600 dark:text-amber-400"
                        )}>
                            {srcPos.length === tgtPos.length
                                ? `✓ ${srcPos.length} patch${srcPos.length > 1 ? "es" : ""}`
                                : `${srcPos.length - tgtPos.length} more target${srcPos.length - tgtPos.length > 1 ? "s" : ""}`
                            }
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
