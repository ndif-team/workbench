"use client";

import { useMemo, useRef } from "react";
import { useVlmLensView } from "@/stores/useVlmLensView";

interface Props {
    chartId: string;
    imageUrl: string | null;
    imageSize: number;
    patchSize: number;
    displayWidth?: number;
    imgPositions: number[];
}

/**
 * Top image widget. Hover -> red bbox on the hovered patch + drives the
 * shared tooltip via the zustand store. Click -> latches the patch
 * (lock); click again or click image/table to release.
 */
export function ImageHoverWidget({
    chartId,
    imageUrl,
    imageSize,
    patchSize,
    displayWidth = 320,
    imgPositions,
}: Props) {
    const wrapRef = useRef<HTMLDivElement>(null);
    // Narrow subscriptions: only re-render when these specific primitives change.
    const hoveredPos = useVlmLensView(
        (s) => s.byChart[chartId]?.hoveredPos ?? null,
    );
    const isLocked = useVlmLensView(
        (s) => s.byChart[chartId]?.isLocked ?? false,
    );
    const patch = useVlmLensView((s) => s.patch);

    const gridSize = imageSize / patchSize;
    const cellPx = displayWidth / gridSize;

    const highlightPatchIdx = useMemo(() => {
        if (hoveredPos === null) return null;
        const idx = imgPositions.indexOf(hoveredPos);
        return idx === -1 ? null : idx;
    }, [hoveredPos, imgPositions]);

    const patchFromEvent = (e: React.MouseEvent): number | null => {
        if (!wrapRef.current) return null;
        const r = wrapRef.current.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        const col = Math.floor(x / cellPx);
        const row = Math.floor(y / cellPx);
        if (col < 0 || col >= gridSize || row < 0 || row >= gridSize) return null;
        return row * gridSize + col;
    };

    const handleMove = (e: React.MouseEvent) => {
        if (isLocked) return;
        const p = patchFromEvent(e);
        if (p === null) return;
        const pos = imgPositions[p] ?? null;
        patch(chartId, { hoveredPos: pos, hoveredLayer: pos === null ? null : 0 });
    };

    const handleLeave = () => {
        if (!isLocked) patch(chartId, { hoveredPos: null, hoveredLayer: null });
    };

    const handleClick = (e: React.MouseEvent) => {
        const p = patchFromEvent(e);
        if (p === null) return;
        if (isLocked) {
            patch(chartId, { isLocked: false, hoveredPos: null, hoveredLayer: null });
        } else {
            patch(chartId, {
                isLocked: true,
                hoveredPos: imgPositions[p] ?? null,
                hoveredLayer: 0,
            });
        }
    };

    const box =
        highlightPatchIdx !== null
            ? {
                  left: (highlightPatchIdx % gridSize) * cellPx,
                  top: Math.floor(highlightPatchIdx / gridSize) * cellPx,
                  size: cellPx,
              }
            : null;

    if (!imageUrl) {
        return (
            <div
                style={{ width: displayWidth, height: displayWidth }}
                className="rounded border border-dashed flex items-center justify-center text-xs text-muted-foreground text-center p-2 shrink-0 self-start"
            >
                Image not in session.
                <br />
                Re-attach to enable hover + segmentation.
            </div>
        );
    }

    return (
        <div
            ref={wrapRef}
            className="relative shrink-0 self-start"
            style={{ width: displayWidth, height: displayWidth }}
            onMouseMove={handleMove}
            onMouseLeave={handleLeave}
            onClick={handleClick}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={imageUrl}
                alt="Input image"
                draggable={false}
                style={{ width: displayWidth, height: displayWidth }}
                className="rounded border object-cover select-none cursor-crosshair"
            />
            {box && (
                <div
                    className="absolute pointer-events-none"
                    style={{
                        left: box.left,
                        top: box.top,
                        width: box.size,
                        height: box.size,
                        border: "2px solid red",
                    }}
                />
            )}
        </div>
    );
}
