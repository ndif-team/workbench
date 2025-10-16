"use client";

import { useEffect, useMemo, useState } from "react";
import { usePatch } from "./PatchProvider";
import type { RangeGroup } from "./PatchProvider";

export function useTokenHighlight(side: "source" | "destination") {
  const {
    mainMode,
    subMode,
    sourceAlignedIdxs,
    destAlignedIdxs,
    setSourceAlignedIdxs,
    setDestAlignedIdxs,
    // ablate/loop state
    sourceAblateIdxs,
    destAblateIdxs,
    sourceLoopIdxs,
    destLoopIdxs,
    setSourceAblateIdxs,
    setDestAblateIdxs,
    setSourceLoopIdxs,
    setDestLoopIdxs,
  } = usePatch();

  const indicesToGroups = (idxs: Set<number>): RangeGroup[] => {
    if (idxs.size === 0) return [];
    const sorted = Array.from(idxs).sort((a, b) => a - b);
    const groups: RangeGroup[] = [];
    let start = sorted[0];
    let end = start;
    for (let i = 1; i < sorted.length; i++) {
      const v = sorted[i];
      if (v === end + 1) {
        end = v;
      } else {
        groups.push({ start, end });
        start = end = v;
      }
    }
    groups.push({ start, end });
    return groups;
  };

  const alignGroups = useMemo(
    () => indicesToGroups(side === "source" ? sourceAlignedIdxs : destAlignedIdxs),
    [side, sourceAlignedIdxs, destAlignedIdxs],
  );

  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStartIdx, setSelectionStartIdx] = useState<number | null>(null);
  const [selectionHoverIdx, setSelectionHoverIdx] = useState<number | null>(null);

  const isIdxInAnyGroup = (idx: number): boolean => {
    for (const g of alignGroups) {
      if (idx >= Math.min(g.start, g.end) && idx <= Math.max(g.start, g.end)) return true;
    }
    return false;
  };

  const addRange = (
    setter: (updater: (prev: Set<number>) => Set<number>) => void,
    start: number,
    end: number,
  ) => {
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    setter((prev) => {
      const next = new Set(prev);
      for (let i = lo; i <= hi; i++) next.add(i);
      return next;
    });
  };

  const addAlignedRange = (start: number, end: number) => {
    if (side === "source") addRange(setSourceAlignedIdxs, start, end);
    else addRange(setDestAlignedIdxs, start, end);
  };

  const toggleAligned = (idx: number) => {
    if (side === "source") {
      setSourceAlignedIdxs((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
        return next;
      });
    } else {
      setDestAlignedIdxs((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
        return next;
      });
    }
  };

  const addAblateRange = (start: number, end: number) => {
    if (side === "source") addRange(setSourceAblateIdxs, start, end);
    else addRange(setDestAblateIdxs, start, end);
  };

  const toggleAblate = (idx: number) => {
    if (side === "source") {
      setSourceAblateIdxs((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
        return next;
      });
    } else {
      setDestAblateIdxs((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
        return next;
      });
    }
  };

  const toggleLoop = (idx: number) => {
    if (side === "source") {
      setSourceLoopIdxs((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
        return next;
      });
    } else {
      setDestLoopIdxs((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
        return next;
      });
    }
  };

  const finalizeSelection = (endIdx: number | null) => {
    if (!(mainMode === "align" && isSelecting && selectionStartIdx !== null)) return;
    const start = selectionStartIdx;
    const end = endIdx ?? selectionHoverIdx ?? selectionStartIdx;
    if (end === null) return;
    if (subMode === "ablate") {
      addAblateRange(start, end);
    } else {
      addAlignedRange(start, end);
    }
    setIsSelecting(false);
    setSelectionStartIdx(null);
    setSelectionHoverIdx(null);
  };

  const onSelectionEnd = (idx: number) => {
    if (subMode !== "ablate") {
      if (selectionStartIdx !== null && selectionStartIdx === idx && selectionHoverIdx === idx) {
        const isInGroup = isIdxInAnyGroup(idx);
        if (isInGroup) {
          toggleAligned(idx);
          setIsSelecting(false);
          setSelectionStartIdx(null);
          setSelectionHoverIdx(null);
          return;
        }
      }
    }
    finalizeSelection(idx);
  };

  const isInLiveSelection = (idx: number) =>
    mainMode === "align" &&
    isSelecting &&
    selectionStartIdx !== null &&
    selectionHoverIdx !== null &&
    idx >= Math.min(selectionStartIdx, selectionHoverIdx) &&
    idx <= Math.max(selectionStartIdx, selectionHoverIdx);

  useEffect(() => {
    if (!isSelecting) return;
    const onUp = () => finalizeSelection(selectionHoverIdx);
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelecting, selectionHoverIdx, mainMode, side, subMode]);

  // read-only helpers for styling
  const isAblated = (idx: number) =>
    side === "source" ? sourceAblateIdxs.has(idx) : destAblateIdxs.has(idx);
  const isLooped = (idx: number) =>
    side === "source" ? sourceLoopIdxs.has(idx) : destLoopIdxs.has(idx);

  return {
    isSelecting,
    isInLiveSelection,
    setIsSelecting,
    setSelectionStartIdx,
    setSelectionHoverIdx,
    isIdxInAnyGroup,
    onSelectionEnd,
    // token options helpers
    isAblated,
    isLooped,
    toggleAblate,
    toggleLoop,
    subMode,
  } as const;
}

export type UseTokenHighlight = ReturnType<typeof useTokenHighlight>;
