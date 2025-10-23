import React, { useCallback, useRef } from "react";
import { useLineCanvas } from "./LineCanvasProvider";
import { useLineData } from "./LineDataProvider";

import { SelectionBounds } from "@/types/charts";
import { useLineView } from "../ViewProvider";
import { pxToDataY } from "./draw";

export const useSelection = () => {
  const { lineCanvasRef, getNearestX, activeSelection, setActiveSelection } = useLineCanvas();
  const { setXRange, setYRange, yRange, bounds } = useLineData();
  const { persistView, clearView, cancelPersistView } = useLineView();

  const selectionRef = useRef<SelectionBounds | null>(null);
  const didDragRef = useRef<boolean>(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const rect = lineCanvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const startXRaw = e.clientX - rect.left;
      const startYRaw = e.clientY - rect.top;
      const startXData = getNearestX(startXRaw, false);
      const startYData = pxToDataY(lineCanvasRef, yRange, startYRaw);
      const start = {
        xMin: startXData,
        yMin: startYData,
        xMax: startXData,
        yMax: startYData,
      };
      selectionRef.current = start;
      setActiveSelection(start);
      didDragRef.current = false;

      let lastXRaw = startXRaw;
      let lastYRaw = startYRaw;

      // Clear any pending annotations
      cancelPersistView();

      const onMove = (ev: MouseEvent) => {
        const r = lineCanvasRef.current?.getBoundingClientRect();
        if (!r) return;
        const mxRaw = ev.clientX - r.left;
        const myRaw = ev.clientY - r.top;
        const mxData = getNearestX(mxRaw, false);
        const myData = pxToDataY(lineCanvasRef, yRange, myRaw);
        const next = { xMin: start.xMin, yMin: start.yMin, xMax: mxData, yMax: myData };
        selectionRef.current = next;
        setActiveSelection(next);
        lastXRaw = mxRaw;
        lastYRaw = myRaw;
        if (Math.abs(lastXRaw - startXRaw) > 3 || Math.abs(lastYRaw - startYRaw) > 3) {
          didDragRef.current = true;
        }
      };

      const onUp = () => {
        const final = selectionRef.current;
        if (final) {
          setActiveSelection(final);
          persistView({
            annotation: final,
          });
        }
        selectionRef.current = null;

        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [lineCanvasRef, getNearestX, setActiveSelection, persistView, yRange, cancelPersistView],
  );

  const clearSelection = useCallback(async () => {
    setActiveSelection(null);
    selectionRef.current = null;
  }, [setActiveSelection]);

  // Zoom into the active selection
  const zoomIntoActiveSelection = useCallback(
    async (activeSelection: SelectionBounds | null) => {
      if (!activeSelection) return;

      const newXMin = Math.min(activeSelection.xMin, activeSelection.xMax);
      const newXMax = Math.max(activeSelection.xMin, activeSelection.xMax);
      const newYMin = Math.min(activeSelection.yMin, activeSelection.yMax);
      const newYMax = Math.max(activeSelection.yMin, activeSelection.yMax);

      // Clamp to overall data bounds
      const clampedXMin = Math.max(bounds.xMin, Math.min(bounds.xMax, newXMin));
      const clampedXMax = Math.max(bounds.xMin, Math.min(bounds.xMax, newXMax));
      const clampedYMin = Math.max(bounds.yMin, Math.min(bounds.yMax, newYMin));
      const clampedYMax = Math.max(bounds.yMin, Math.min(bounds.yMax, newYMax));

      setXRange([clampedXMin, clampedXMax]);
      setYRange([clampedYMin, clampedYMax]);

      // Clear the annotation and persist new bounds
      await clearSelection();
      persistView({
        bounds: {
          xMin: clampedXMin,
          xMax: clampedXMax,
          yMin: clampedYMin,
          yMax: clampedYMax,
        },
        annotation: undefined,
      });
    },
    [clearSelection, setXRange, setYRange, bounds, persistView],
  );

  // Reset the zoom to the default range
  const resetZoom = useCallback(async () => {
    await clearSelection();
    setXRange([bounds.xMin, bounds.xMax]);
    setYRange([0, 1]);
    await clearView();
  }, [clearSelection, setXRange, setYRange, bounds, clearView]);

  return {
    handleMouseDown,
    clearSelection,
    zoomIntoActiveSelection,
    resetZoom,
    activeSelection,
    didDragRef,
    getNearestX,
  };
};
