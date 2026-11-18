"use client";

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import type { Token } from "@/types/models";
import type { SourcePosition } from "@/types/activationPatching";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
    useActivationPatchingState,
    PatchPromptSection,
    PatchTools,
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
    /** Draws the composer's toolbar around the patch tools and the hint for
     * the next step, so they share the pickers' row. */
    toolbar: (tools: ReactNode, hint: string) => ReactNode;
}

/**
 * Activation patching's part of Home's composer, in the shape of the chart's
 * composer on a phone: the source prompt over the target, then the
 * composer's toolbar, which it hands the patch tools (`PatchTools`) and a hint
 * for the next step. A patch's two ends share
 * a color, and off a phone an arrow joins them.
 */
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
    toolbar,
}: ActivationPatchingLandingInputProps) {
    const arrows = useIsMobile() === false;
    const containerRef = useRef<HTMLDivElement>(null);
    const connectingArrowRef = useRef<SVGPathElement>(null);
    const [hoverTgtIdx, setHoverTgtIdx] = useState<number | null>(null);
    const [srcEditing, setSrcEditing] = useState(!srcPrompt.trim());
    const [tgtEditing, setTgtEditing] = useState(!tgtPrompt.trim());

    // Use shared hook for state management
    const {
        pendingRangeStart,
        setPendingRangeStart,
        handleSrcTokenClick,
        handleTgtTokenClick,
        isConnecting,
        clearAll,
        hint: patchHint,
        patchTools,
    } = useActivationPatchingState({
        srcPos,
        setSrcPos,
        tgtPos,
        setTgtPos,
        tgtFreeze,
        setTgtFreeze,
    });

    const connecting = isConnecting && !srcEditing && !tgtEditing;
    const { handleMouseMove, handleMouseLeave } = useMouseFollowingArrow({
        containerRef,
        connectingArrowRef,
        isConnecting: connecting,
        srcPos,
        tgtPos,
        enabled: arrows,
    });

    // A source added after a pairing must not snap its arrow to the target last hovered.
    useEffect(() => {
        setHoverTgtIdx(null);
    }, [srcPos.length]);

    // Track previous tokens to detect tokenization changes
    const prevSrcTokensRef = useRef<Token[]>(srcTokens);
    const prevTgtTokensRef = useRef<Token[]>(tgtTokens);

    const tokensEqual = useCallback((a: Token[], b: Token[]) => {
        if (a.length !== b.length) return false;
        return a.every((t, i) => t.id === b[i].id);
    }, []);

    // Clear patch configurations when tokenization actually changes
    useEffect(() => {
        const prev = prevSrcTokensRef.current;
        prevSrcTokensRef.current = srcTokens;
        if (tokensEqual(prev, srcTokens)) return;

        setSrcPos([]);
        setPendingRangeStart(null);
        // Also clear target pairings since they depend on source positions
        setTgtPos([]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [srcTokens]);

    useEffect(() => {
        const prev = prevTgtTokensRef.current;
        prevTgtTokensRef.current = tgtTokens;
        if (tokensEqual(prev, tgtTokens)) return;

        setTgtPos([]);
        setTgtFreeze([]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tgtTokens]);

    const hint = disabled || srcEditing || tgtEditing ? "" : patchHint;

    return (
        <div
            ref={containerRef}
            className="relative"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            {arrows && srcPos.length > 0 && !srcEditing && !tgtEditing && (
                <EnhancedPatchArrows
                    containerRef={containerRef}
                    srcPos={srcPos}
                    tgtPos={tgtPos}
                    srcEditing={srcEditing}
                    tgtEditing={tgtEditing}
                    hoverTgtIdx={hoverTgtIdx}
                    isConnecting={connecting}
                    enableGlow={false}
                    enableMouseFollowing={true}
                    connectingArrowRef={connectingArrowRef}
                />
            )}
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
                placeholder="Enter a source prompt..."
                isEditing={srcEditing}
                setIsEditing={setSrcEditing}
                selectedPositions={srcPos}
                pendingRangeStart={pendingRangeStart}
                onSrcTokenClick={handleSrcTokenClick}
            />
            <div aria-hidden className="mx-4 border-t" />
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
                placeholder="Enter a target prompt..."
                isEditing={tgtEditing}
                setIsEditing={setTgtEditing}
                tgtSelectedPositions={tgtPos}
                frozenPositions={tgtFreeze}
                onTgtTokenClick={handleTgtTokenClick}
                onTokenHover={arrows && connecting ? setHoverTgtIdx : undefined}
                onTokenLeave={arrows && connecting ? () => setHoverTgtIdx(null) : undefined}
            />
            {toolbar(
                <PatchTools
                    {...patchTools}
                    srcTokens={srcTokens}
                    tgtTokens={tgtTokens}
                    disabled={disabled}
                />,
                hint,
            )}
        </div>
    );
}
