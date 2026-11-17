"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Token } from "@/types/models";
import type { SourcePosition } from "@/types/activationPatching";
import {
    useActivationPatchingState,
    PatchPromptSection,
    PatchTools,
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

/**
 * Activation patching's part of Home's composer, in the shape of the chart's
 * composer on a phone: the source prompt over the target, then the patch
 * tools (`PatchTools`) with a hint for the next step. A patch's two ends share
 * a color; there are no arrows.
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
}: ActivationPatchingLandingInputProps) {
    const [rangeMode, setRangeMode] = useState(false);
    const [freezeMode, setFreezeMode] = useState(false);
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
    } = useActivationPatchingState({
        srcPos,
        setSrcPos,
        tgtPos,
        setTgtPos,
        tgtFreeze,
        setTgtFreeze,
    });

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

    const hint =
        disabled || srcEditing || tgtEditing
            ? ""
            : PatchTools.hint({ pendingRangeStart, isConnecting, rangeMode, freezeMode });

    return (
        <div className="divide-y">
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
                onSrcTokenClick={(pos, shift) => handleSrcTokenClick(pos, shift || rangeMode)}
            />
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
                onTgtTokenClick={(pos, ctrl) => handleTgtTokenClick(pos, ctrl || freezeMode)}
            />
            <div className="flex items-center gap-1 px-2 py-1">
                <PatchTools
                    srcTokens={srcTokens}
                    tgtTokens={tgtTokens}
                    srcPos={srcPos}
                    tgtPos={tgtPos}
                    tgtFreeze={tgtFreeze}
                    rangeMode={rangeMode}
                    onRangeModeChange={(on) => {
                        setRangeMode(on);
                        setPendingRangeStart(null);
                    }}
                    freezeMode={freezeMode}
                    onFreezeModeChange={setFreezeMode}
                    disabled={disabled}
                    onRemove={(index) => {
                        const pos = srcPos[index];
                        handleSrcTokenClick(typeof pos === "number" ? pos : pos[0], false);
                    }}
                    onClear={clearAll}
                />
                <span
                    aria-live="polite"
                    className="min-w-0 flex-1 px-2 text-right text-xs text-muted-foreground"
                >
                    {hint}
                </span>
            </div>
        </div>
    );
}
