"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

import { useShallow } from "zustand/react/shallow";
import { useVlmLensView } from "@/stores/useVlmLensView";

import {
    EMPTY_TOKEN,
    SEG_ALPHA,
    colorToHex,
    effectiveToken,
    hexToRgba,
    tokenColor,
} from "./colors";

interface Props {
    chartId: string;
    imageUrl: string | null;
    imageSize: number;
    patchSize: number;
    displayWidth?: number;
    numLayers: number;
    numImageTokens: number;
    imgPositions: number[];
    topk: [string, string][][][];
}

/**
 * Bottom-of-input-panel widget. Vertical layout to fit the narrow column:
 * image with canvas overlay on top, layer + min-p sliders, then scrollable
 * legend below. Reads/writes the cross-panel zustand store.
 */
export function SegmentationWidget({
    chartId,
    imageUrl,
    imageSize,
    patchSize,
    displayWidth = 320,
    numLayers,
    numImageTokens,
    imgPositions,
    topk,
}: Props) {
    // Subscribe to just the primitives we read; use a shallow selector for
    // colorOverrides so we don't re-render on every hover-position change.
    const { selectedLayer, threshold, hoveredPos, isLocked } = useVlmLensView(
        useShallow((s) => ({
            selectedLayer: s.byChart[chartId]?.selectedLayer ?? 0,
            threshold: s.byChart[chartId]?.threshold ?? 0.1,
            hoveredPos: s.byChart[chartId]?.hoveredPos ?? null,
            isLocked: s.byChart[chartId]?.isLocked ?? false,
        })),
    );
    const colorOverrides = useVlmLensView(
        useShallow((s) => s.byChart[chartId]?.colorOverrides ?? {}),
    );
    const patch = useVlmLensView((s) => s.patch);
    const setOverride = useVlmLensView((s) => s.setOverride);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const [hoveredToken, setHoveredToken] = useState<string | null>(null);

    const gridSize = imageSize / patchSize;
    const cellPx = displayWidth / gridSize;

    const counts = useMemo(() => {
        const m = new Map<string, number>();
        for (let p = 0; p < numImageTokens; p++) {
            const tok = effectiveToken(topk, selectedLayer, imgPositions[p], threshold);
            m.set(tok, (m.get(tok) ?? 0) + 1);
        }
        return [...m.entries()].sort((a, b) => b[1] - a[1]);
    }, [topk, selectedLayer, threshold, numImageTokens, imgPositions]);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const cell = canvas.width / gridSize;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let p = 0; p < numImageTokens; p++) {
            const tok = effectiveToken(topk, selectedLayer, imgPositions[p], threshold);
            ctx.fillStyle = tokenColor(tok, colorOverrides);
            const row = Math.floor(p / gridSize);
            const col = p % gridSize;
            ctx.fillRect(col * cell, row * cell, cell, cell);
        }

        if (hoveredToken !== null) {
            const total = gridSize * gridSize;
            const inSet = new Array(total).fill(false);
            for (let p = 0; p < numImageTokens; p++) {
                const tok = effectiveToken(topk, selectedLayer, imgPositions[p], threshold);
                if (tok === hoveredToken) inSet[p] = true;
            }
            ctx.strokeStyle = "red";
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < total; i++) {
                if (!inSet[i]) continue;
                const r = Math.floor(i / gridSize);
                const c = i % gridSize;
                const x = c * cell;
                const y = r * cell;
                if (r === 0 || !inSet[i - gridSize]) {
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + cell, y);
                }
                if (r === gridSize - 1 || !inSet[i + gridSize]) {
                    ctx.moveTo(x, y + cell);
                    ctx.lineTo(x + cell, y + cell);
                }
                if (c === 0 || !inSet[i - 1]) {
                    ctx.moveTo(x, y);
                    ctx.lineTo(x, y + cell);
                }
                if (c === gridSize - 1 || !inSet[i + 1]) {
                    ctx.moveTo(x + cell, y);
                    ctx.lineTo(x + cell, y + cell);
                }
            }
            ctx.stroke();
        }
    }, [
        gridSize,
        numImageTokens,
        imgPositions,
        topk,
        selectedLayer,
        threshold,
        colorOverrides,
        hoveredToken,
    ]);

    useEffect(() => {
        draw();
    }, [draw]);

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

    const onCanvasMove = (e: React.MouseEvent) => {
        if (isLocked) return;
        const p = patchFromEvent(e);
        if (p === null) return;
        patch(chartId, {
            hoveredPos: imgPositions[p] ?? null,
            hoveredLayer: selectedLayer,
        });
    };
    const onCanvasLeave = () => {
        if (!isLocked) patch(chartId, { hoveredPos: null, hoveredLayer: null });
    };

    const handlePick = (token: string, hex: string) => {
        setOverride(chartId, token, hexToRgba(hex, SEG_ALPHA));
    };

    return (
        <div className="flex flex-col gap-3">
            <div
                ref={wrapRef}
                className="relative shrink-0 self-start"
                style={{ width: displayWidth, height: displayWidth }}
                onMouseMove={onCanvasMove}
                onMouseLeave={onCanvasLeave}
            >
                {imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        src={imageUrl}
                        alt="Segmentation base"
                        draggable={false}
                        style={{ width: displayWidth, height: displayWidth }}
                        className="rounded border object-cover select-none cursor-crosshair"
                    />
                ) : (
                    <div
                        style={{ width: displayWidth, height: displayWidth }}
                        className="rounded border border-dashed flex items-center justify-center text-xs text-muted-foreground text-center p-2"
                    >
                        Re-attach image to view segmentation.
                    </div>
                )}
                <canvas
                    ref={canvasRef}
                    width={displayWidth}
                    height={displayWidth}
                    style={{ width: displayWidth, height: displayWidth }}
                    className="absolute inset-0 pointer-events-none"
                />
                {hoveredPos !== null && imgPositions.includes(hoveredPos) && (
                    <div
                        className="absolute pointer-events-none"
                        style={{
                            left: (imgPositions.indexOf(hoveredPos) % gridSize) * cellPx,
                            top:
                                Math.floor(imgPositions.indexOf(hoveredPos) / gridSize) *
                                cellPx,
                            width: cellPx,
                            height: cellPx,
                            border: "2px solid red",
                        }}
                    />
                )}
            </div>

            <div className="flex items-center gap-2 text-xs">
                <Label className="text-xs font-medium w-12 shrink-0">Layer</Label>
                <Slider
                    min={1}
                    max={numLayers}
                    step={1}
                    value={[selectedLayer + 1]}
                    onValueChange={([v]) => patch(chartId, { selectedLayer: v - 1 })}
                    className="flex-1"
                />
                <span className="tabular-nums w-12 text-right">
                    {selectedLayer + 1}/{numLayers}
                </span>
            </div>

            <div className="flex items-center gap-2 text-xs">
                <Label className="text-xs font-medium w-12 shrink-0">Min p</Label>
                <Slider
                    min={0}
                    max={1}
                    step={0.01}
                    value={[threshold]}
                    onValueChange={([v]) => patch(chartId, { threshold: v })}
                    className="flex-1"
                />
                <span className="tabular-nums w-12 text-right">
                    {threshold.toFixed(2)}
                </span>
            </div>

            <div className="border-t pt-2 max-h-60 overflow-y-auto text-xs">
                {counts.map(([token, n]) => {
                    const isEmpty = token === EMPTY_TOKEN;
                    const swatchColor = tokenColor(token, colorOverrides);
                    return (
                        <div
                            key={token}
                            className={cn(
                                "flex items-center gap-2 px-1 py-1 rounded cursor-default",
                                hoveredToken === token && "bg-muted",
                            )}
                            onMouseEnter={() => setHoveredToken(token)}
                            onMouseLeave={() => setHoveredToken(null)}
                        >
                            <label
                                title={
                                    isEmpty
                                        ? "Below-threshold patches (always white)"
                                        : "Click to choose color"
                                }
                                className={cn(
                                    "inline-block size-4 rounded border shrink-0",
                                    !isEmpty && "cursor-pointer",
                                )}
                                style={{ background: swatchColor }}
                            >
                                {!isEmpty && (
                                    <input
                                        type="color"
                                        defaultValue={colorToHex(swatchColor)}
                                        onChange={(e) => handlePick(token, e.target.value)}
                                        className="size-0 opacity-0"
                                    />
                                )}
                            </label>
                            <span className="font-mono truncate flex-1">
                                {JSON.stringify(token)}
                            </span>
                            <span className="text-muted-foreground tabular-nums">{n}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
