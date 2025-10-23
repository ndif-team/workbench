import React, { useEffect, useRef } from "react";
import { drawVerticalLinePx, clearCrosshair } from "./draw";
import { useLineHover } from "./LineHoverProvider";
import { useDpr } from "../useDpr";

interface UseCrosshairProps {
  rafRef: React.MutableRefObject<number | null>;
}

export const useCrosshair = ({ rafRef }: UseCrosshairProps) => {
  const crosshairCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const { hoverSnappedXPx } = useLineHover();

  useDpr(crosshairCanvasRef);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (hoverSnappedXPx != null) {
        drawVerticalLinePx(crosshairCanvasRef, hoverSnappedXPx);
      } else {
        clearCrosshair(crosshairCanvasRef);
      }
    });
  }, [hoverSnappedXPx, rafRef, crosshairCanvasRef]);

  return { crosshairCanvasRef };
};
