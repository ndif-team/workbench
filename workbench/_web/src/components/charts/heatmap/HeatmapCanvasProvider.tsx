import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useHeatmapData } from "./HeatmapDataProvider";
import { useDpr } from "../useDpr";
import { CellDimensions, getCellDimensions } from "./heatmap-geometry";
import { HeatmapBounds } from "@/types/charts";
import { clearRect, drawRect } from "./draw";

interface HeatmapCanvasContextValue {
  heatmapCanvasRef: React.RefObject<HTMLCanvasElement>;
  rafRef: React.MutableRefObject<number | null>;
  cellDimensions: CellDimensions | null;
  activeSelection: HeatmapBounds | null;
  setActiveSelection: (selection: HeatmapBounds | null) => void;
}

const HeatmapCanvasContext = createContext<HeatmapCanvasContextValue | null>(null);

export const useHeatmapCanvas = () => {
  const ctx = useContext(HeatmapCanvasContext);
  if (!ctx) throw new Error("useHeatmapCanvas must be used within a HeatmapCanvasProvider");
  return ctx;
};

export const HeatmapCanvasProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const heatmapCanvasRef = useRef<HTMLCanvasElement>(null);
  const { filteredData: data } = useHeatmapData();
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
  }, [data]);

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
    <HeatmapCanvasContext.Provider value={contextValue}>{children}</HeatmapCanvasContext.Provider>
  );
};
