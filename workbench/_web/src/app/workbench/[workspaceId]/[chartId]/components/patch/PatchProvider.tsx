"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Token } from "@/types/models";

export type PatchMainMode = "edit" | "connect" | "align";
export type PatchSubMode = "loop" | "ablate";

export interface RangeGroup {
  start: number;
  end: number;
}

interface PatchState {
  // Text prompts
  sourceText: string;
  destText: string;

  sourceTokenData: Token[];
  destTokenData: Token[];

  // Mode
  mainMode: PatchMainMode;
  subMode: PatchSubMode | null;

  // Alignment highlighted indices and derived groups
  sourceAlignedIdxs: Set<number>;
  destAlignedIdxs: Set<number>;

  // Token options
  sourceAblateIdxs: Set<number>;
  destAblateIdxs: Set<number>;
  sourceLoopIdxs: Set<number>;
  destLoopIdxs: Set<number>;
}

interface PatchActions {
  setSourceText: (text: string) => void;
  setDestText: (text: string) => void;
  setSourceTokenData: (tokenData: Token[]) => void;
  setDestTokenData: (tokenData: Token[]) => void;
  setMainMode: (mode: PatchMainMode) => void;
  setSubMode: (mode: PatchSubMode | null) => void;
  setSourceAlignedIdxs: React.Dispatch<React.SetStateAction<Set<number>>>;
  setDestAlignedIdxs: React.Dispatch<React.SetStateAction<Set<number>>>;

  setSourceAblateIdxs: React.Dispatch<React.SetStateAction<Set<number>>>;
  setDestAblateIdxs: React.Dispatch<React.SetStateAction<Set<number>>>;
  setSourceLoopIdxs: React.Dispatch<React.SetStateAction<Set<number>>>;
  setDestLoopIdxs: React.Dispatch<React.SetStateAction<Set<number>>>;
}

const PatchContext = createContext<(PatchState & PatchActions) | null>(null);

export function usePatch(): PatchState & PatchActions {
  const ctx = useContext(PatchContext);
  if (!ctx) throw new Error("usePatch must be used within PatchProvider");
  return ctx;
}

export default function PatchProvider({ children }: { children: React.ReactNode }) {
  // Text
  const [sourceText, setSourceText] = useState("");
  const [destText, setDestText] = useState("");

  // Tokens
  const [sourceTokenData, setSourceTokenData] = useState<Token[]>([]);
  const [destTokenData, setDestTokenData] = useState<Token[]>([]);

  // Mode
  const [mainMode, setMainMode] = useState<PatchMainMode>("edit");
  const [subMode, setSubMode] = useState<PatchSubMode | null>(null);

  // Alignment highlighted indices
  const [sourceAlignedIdxs, setSourceAlignedIdxs] = useState<Set<number>>(new Set());
  const [destAlignedIdxs, setDestAlignedIdxs] = useState<Set<number>>(new Set());

  // Token options state
  const [sourceAblateIdxs, setSourceAblateIdxs] = useState<Set<number>>(new Set());
  const [destAblateIdxs, setDestAblateIdxs] = useState<Set<number>>(new Set());
  const [sourceLoopIdxs, setSourceLoopIdxs] = useState<Set<number>>(new Set());
  const [destLoopIdxs, setDestLoopIdxs] = useState<Set<number>>(new Set());

  const value: PatchState & PatchActions = {
    sourceText,
    destText,
    mainMode,
    subMode,
    sourceTokenData,
    destTokenData,
    sourceAlignedIdxs,
    destAlignedIdxs,
    sourceAblateIdxs,
    destAblateIdxs,
    sourceLoopIdxs,
    destLoopIdxs,

    setSourceText,
    setDestText,
    setSourceTokenData,
    setDestTokenData,
    setMainMode,
    setSubMode,
    setSourceAlignedIdxs,
    setDestAlignedIdxs,
    setSourceAblateIdxs,
    setDestAblateIdxs,
    setSourceLoopIdxs,
    setDestLoopIdxs,
  };

  // When entering align mode with no existing highlights, compute initial suggestions
  useEffect(() => {
    if (mainMode !== "align") return;
    const noExisting = sourceAlignedIdxs.size === 0 && destAlignedIdxs.size === 0;
    if (!noExisting) return;
    if (sourceTokenData.length === 0 || destTokenData.length === 0) return;
    const { sourceGroups, destGroups } = computeInitialAlignGroups(sourceTokenData, destTokenData);
    if (sourceGroups.length > 0 || destGroups.length > 0) {
      if (sourceGroups.length > 0) {
        const idxs = new Set<number>();
        for (const g of sourceGroups) {
          const s = Math.min(g.start, g.end);
          const e = Math.max(g.start, g.end);
          for (let i = s; i <= e; i++) idxs.add(i);
        }
        setSourceAlignedIdxs(idxs);
      }
      if (destGroups.length > 0) {
        const idxs = new Set<number>();
        for (const g of destGroups) {
          const s = Math.min(g.start, g.end);
          const e = Math.max(g.start, g.end);
          for (let i = s; i <= e; i++) idxs.add(i);
        }
        setDestAlignedIdxs(idxs);
      }
    }
    // else leave empty when equal lengths or trivial cases
  }, [mainMode, sourceTokenData, destTokenData, sourceAlignedIdxs.size, destAlignedIdxs.size]);

  return <PatchContext.Provider value={value}>{children}</PatchContext.Provider>;
}

// Compute initial alignment groups based purely on token counts.
// If lengths are equal → no groups. If one side is longer by d tokens,
// create a single contiguous group of size (d + 1) on the longer side
// starting at the first mismatch index (case-insensitive), and a single-token
// group at the same index on the shorter side.
export function computeInitialAlignGroups(
  src: Token[],
  dst: Token[],
): { sourceGroups: RangeGroup[]; destGroups: RangeGroup[] } {
  const n = src.length;
  const m = dst.length;
  if (n === 0 || m === 0) return { sourceGroups: [], destGroups: [] };
  if (n === m) return { sourceGroups: [], destGroups: [] };

  const a = src.map((t) => t.text.toLowerCase());
  const b = dst.map((t) => t.text.toLowerCase());

  const minLen = Math.min(n, m);
  let idx = 0;
  while (idx < minLen && a[idx] === b[idx]) idx++;
  if (idx >= minLen) idx = Math.max(0, minLen - 1);

  if (n > m) {
    const d = n - m;
    const start = idx;
    const end = Math.min(n - 1, idx + d);
    return {
      sourceGroups: [{ start, end }],
      destGroups: [{ start: idx, end: idx }],
    };
  } else {
    const d = m - n;
    const start = idx;
    const end = Math.min(m - 1, idx + d);
    return {
      sourceGroups: [{ start: idx, end: idx }],
      destGroups: [{ start, end }],
    };
  }
}
