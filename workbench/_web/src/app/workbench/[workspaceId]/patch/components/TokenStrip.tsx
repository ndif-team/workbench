"use client";

import React, { useCallback } from "react";
import { cn } from "@/lib/utils";
import type { PatchSide } from "./PatchProvider";
import { usePatch } from "./PatchProvider";

function useTokenClasses(side: PatchSide) {
    const {
        isAlignMode,
        isAblateMode,
        isConnectMode,
        sourceAlignGroups,
        destAlignGroups,
        sourceAblations,
        destAblations,
        connections,
        pendingConnect,
    } = usePatch();

    const inGroup = useCallback((idx: number) => {
        const groups = side === "source" ? sourceAlignGroups : destAlignGroups;
        return groups.some(g => idx >= g.start && idx <= g.end);
    }, [side, sourceAlignGroups, destAlignGroups]);

    const isAblated = useCallback((idx: number) => {
        return side === "source" ? sourceAblations.has(idx) : destAblations.has(idx);
    }, [side, sourceAblations, destAblations]);

    const isConnected = useCallback((idx: number) => {
        return side === "source" ? connections.some(c => c.sourceIdx === idx) : connections.some(c => c.destIdx === idx);
    }, [side, connections]);

    const isPending = useCallback((idx: number) => {
        return pendingConnect && pendingConnect.side === side && pendingConnect.idx === idx;
    }, [side, pendingConnect]);

    return (idx: number) => {
        const base = "px-1 py-0.5 rounded text-sm transition-colors select-none";
        const green = "bg-green-500/30";
        const red = "bg-red-500/30";
        const blue = "bg-blue-500/30";
        const pending = "ring-2 ring-blue-500/60";

        let color = "";
        if (inGroup(idx)) color = green;
        else if (isAblated(idx)) color = red;
        else if (isConnected(idx)) color = blue;

        const connectCursor = isConnectMode ? "cursor-crosshair" : "";
        const ablateCursor = isAblateMode ? "cursor-pointer" : "";
        const alignCursor = isAlignMode ? "cursor-col-resize" : "";

        return cn(base, color, connectCursor || ablateCursor || alignCursor, isPending(idx) && pending);
    };
}

export default function TokenStrip({ side }: { side: PatchSide }) {
    const getClass = useTokenClasses(side);
    const {
        sourceTokens,
        destTokens,
        isAlignMode,
        isAblateMode,
        isConnectMode,
        beginAlignDrag,
        updateAlignDrag,
        endAlignDrag,
        toggleAblationAt,
        beginConnectAt,
        attemptConnectTo,
    } = usePatch();

    const tokens = side === "source" ? sourceTokens : destTokens;

    const handleMouseDown = (idx: number) => {
        if (isAlignMode) beginAlignDrag(side, idx);
        if (isConnectMode) beginConnectAt(side, idx);
    };
    const handleMouseEnter = (idx: number) => {
        if (isAlignMode) updateAlignDrag(side, idx);
    };
    const handleMouseUp = (idx: number) => {
        if (isAlignMode) endAlignDrag(side);
        if (isConnectMode) attemptConnectTo(side, idx);
    };

    return (
        <div className="max-h-40 overflow-y-auto w-full custom-scrollbar whitespace-pre-wrap">
            {tokens.map((t, i) => (
                <span
                    key={`${side}-tok-${i}`}
                    className={getClass(i)}
                    onMouseDown={() => handleMouseDown(i)}
                    onMouseEnter={() => handleMouseEnter(i)}
                    onMouseUp={() => handleMouseUp(i)}
                    onClick={() => { if (isAblateMode) toggleAblationAt(side, i); }}
                    data-token-id={i}
                >
                    {t.text}
                </span>
            ))}
        </div>
    );
}