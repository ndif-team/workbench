"use client";

import React, { useCallback } from "react";
import { cn } from "@/lib/utils";
import type { PatchSide } from "./PatchProvider";
import { usePatch } from "./PatchProvider";

// Styling similar to lens TokenArea
const TOKEN_STYLES = {
    base: "text-sm whitespace-pre-wrap select-none !box-border relative",
    alignHover: "hover:bg-green-500/20 hover:after:absolute hover:after:inset-0 hover:after:border hover:after:border-green-500/30",
} as const;

const fix = (text: string) => {
    const numNewlines = (text.match(/\n/g) || []).length;
    const result = text
        .replace(/\r\n/g, "\\r\\n")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
    return { result, numNewlines };
};

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

    return (tokenText: string, idx: number) => {
        const green = "bg-green-500/30 after:absolute after:inset-0 after:border after:border-green-500/30";
        const red = "bg-red-500/30 after:absolute after:inset-0 after:border after:border-red-500/30";
        const blue = "bg-blue-500/30 after:absolute after:inset-0 after:border after:border-blue-500/30";
        const pending = "ring-2 ring-blue-500/60";

        let color = "bg-transparent";
        if (inGroup(idx)) color = green;
        else if (isAblated(idx)) color = red;
        else if (isConnected(idx)) color = blue;

        const connectCursor = isConnectMode ? "cursor-crosshair" : "";
        const ablateCursor = isAblateMode ? "cursor-pointer" : "";
        const alignCursor = isAlignMode ? "cursor-col-resize" : "";

        return cn(
            TOKEN_STYLES.base,
            color,
            (!isAblated(idx) && isAlignMode) && TOKEN_STYLES.alignHover,
            tokenText === "\\n" ? "w-full" : "w-fit",
            connectCursor || ablateCursor || alignCursor,
            isPending(idx) && pending,
        );
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
        <div className="max-h-40 overflow-y-auto w-full custom-scrollbar select-none whitespace-pre-wrap" style={{ display: "inline" }}>
            {tokens.map((t, i) => {
                const { result, numNewlines } = fix(t.text);
                const cls = getClass(result, i);
                return (
                    <span key={`${side}-token-wrap-${i}`}>
                        <span
                            data-side={side}
                            data-token-id={i}
                            className={cls}
                            onMouseDown={() => handleMouseDown(i)}
                            onMouseEnter={() => handleMouseEnter(i)}
                            onMouseUp={() => handleMouseUp(i)}
                            onClick={() => { if (isAblateMode) toggleAblationAt(side, i); }}
                        >
                            {result}
                        </span>
                        {numNewlines > 0 && "\n".repeat(numNewlines)}
                    </span>
                );
            })}
        </div>
    );
}