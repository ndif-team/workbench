import React, { createContext, useCallback, useContext, ReactNode, useState } from "react";
import { lineMargin as margin } from "../theming";
import { useLineData } from "./LineDataProvider";
import { useLineCanvas } from "./LineCanvasProvider";

interface LineHoverContextValue {
  handleMouseMove: (e: React.MouseEvent) => void;
  handleMouseLeave: () => void;
  hoverSnappedXPx: number | null;
  hoverSnappedXValue: number | null;
  hoverXRaw: number | null;
  hoverYData: number | null;
}

const LineHoverContext = createContext<LineHoverContextValue | null>(null);

export const useLineHover = () => {
  const context = useContext(LineHoverContext);
  if (!context) {
    throw new Error("useLineHover must be used within a LineHoverProvider");
  }
  return context;
};

interface LineHoverProviderProps {
  children: ReactNode;
}

export const LineHoverProvider: React.FC<LineHoverProviderProps> = ({ children }) => {
  const { lineCanvasRef, getNearestX } = useLineCanvas();
  const { yRange } = useLineData();

  const [hoverXRaw, setHoverXRaw] = useState<number | null>(null);
  const [hoverYRaw, setHoverYRaw] = useState<number | null>(null);

  const hoverSnappedXPx = React.useMemo(() => {
    if (hoverXRaw == null) return null;
    return getNearestX(hoverXRaw, true);
  }, [hoverXRaw, getNearestX]);

  const hoverSnappedXValue = React.useMemo(() => {
    if (hoverXRaw == null) return null;
    return getNearestX(hoverXRaw, false);
  }, [hoverXRaw, getNearestX]);

  const hoverYData = React.useMemo(() => {
    const canvas = lineCanvasRef.current;
    if (!canvas || hoverYRaw == null) return null;
    const innerHeight = Math.max(1, canvas.clientHeight - margin.top - margin.bottom);
    const curY = yRange as readonly [number, number];
    const y = curY[0] + (1 - (hoverYRaw - margin.top) / innerHeight) * (curY[1] - curY[0]);
    return y;
  }, [hoverYRaw, lineCanvasRef, yRange]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = lineCanvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const xRaw = e.clientX - rect.left;
      const yRaw = e.clientY - rect.top;
      setHoverXRaw(xRaw);
      setHoverYRaw(yRaw);
    },
    [lineCanvasRef],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverXRaw(null);
    setHoverYRaw(null);
  }, []);

  const contextValue: LineHoverContextValue = {
    handleMouseMove,
    handleMouseLeave,
    hoverSnappedXPx,
    hoverSnappedXValue,
    hoverXRaw,
    hoverYData,
  };

  return <LineHoverContext.Provider value={contextValue}>{children}</LineHoverContext.Provider>;
};
