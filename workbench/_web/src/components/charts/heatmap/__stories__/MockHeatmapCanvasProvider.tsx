"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useMockHeatmapData } from "./MockHeatmapDataProvider";
import { useDpr } from "../../useDpr";
import { CellDimensions, getCellDimensions } from "../heatmap-geometry";
import { HeatmapBounds } from "@/types/charts";
import { clearRect, drawRect } from "../draw";

interface HeatmapCanvasContextValue {
    heatmapCanvasRef: React.RefObject<HTMLCanvasElement>;
    rafRef: React.MutableRefObject<number | null>;
    cellDimensions: CellDimensions | null;
    activeSelection: HeatmapBounds | null;
    setActiveSelection: (selection: HeatmapBounds | null) => void;
}

const MockHeatmapCanvasContext = createContext<HeatmapCanvasContextValue | null>(null);

export const useHeatmapCanvas = () => {
    const ctx = useContext(MockHeatmapCanvasContext);
    if (!ctx) throw new Error("useHeatmapCanvas must be used within a MockHeatmapCanvasProvider");
    return ctx;
};

export const MockHeatmapCanvasProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const heatmapCanvasRef = useRef<HTMLCanvasElement>(null);
    const { filteredData: data } = useMockHeatmapData();
    const [cellDimensions, setCellDimensions] = useState<CellDimensions | null>(null);
    const [activeSelection, setActiveSelection] = useState<HeatmapBounds | null>(null);
    const activeSelectionRef = useRef<HeatmapBounds | null>(null);
    activeSelectionRef.current = activeSelection;

    const rafRef = useRef<number | null>(null);

    // Redraw function on resize/DPR changes
    const handleResize = useCallback(() => {
        // Recompute cell dimensions on size change
        const dims = getCellDimensions(heatmapCanvasRef, data);
        setCellDimensions(dims);

        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            if (activeSelectionRef.current && dims) {
                drawRect(heatmapCanvasRef, activeSelectionRef.current, dims);
            } else {
                clearRect(heatmapCanvasRef);
            }
        });
    }, [data]);

    // DPR/resize handling + initial dimension compute
    useDpr(heatmapCanvasRef, handleResize);

    // Also recompute dimensions when data changes
    useEffect(() => {
        handleResize();
    }, [data, handleResize]);

    // Draw selection when it changes
    useEffect(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        if (!cellDimensions) return;
        rafRef.current = requestAnimationFrame(() => {
            if (activeSelection) {
                drawRect(heatmapCanvasRef, activeSelection, cellDimensions);
            } else {
                clearRect(heatmapCanvasRef);
            }
        });
    }, [activeSelection, cellDimensions]);

    const contextValue: HeatmapCanvasContextValue = {
        heatmapCanvasRef,
        rafRef,
        cellDimensions,
        activeSelection,
        setActiveSelection,
    };

    return (
        <MockHeatmapCanvasContext.Provider value={contextValue}>
            {children}
        </MockHeatmapCanvasContext.Provider>
    );
};

// Re-export for compatibility
export { MockHeatmapCanvasProvider as HeatmapCanvasProvider };
