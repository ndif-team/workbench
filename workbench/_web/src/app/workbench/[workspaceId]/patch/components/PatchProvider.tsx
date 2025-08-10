"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Token } from "@/types/models";
import { computeInitialDiffGroups, tokenizeLocal } from "./tokenUtils";

export type PatchSide = "source" | "destination";

export interface ConnectionPair {
    sourceIdx: number;
    destIdx: number;
}

export interface RangeGroup {
    start: number; // inclusive
    end: number;   // inclusive
}

interface PatchState {
    // Text prompts
    sourceText: string;
    destText: string;

    // Edit mode
    isEditing: boolean;

    // Tokens
    sourceTokens: Token[];
    destTokens: Token[];

    // Modes
    isAlignMode: boolean;
    isAblateMode: boolean;
    isConnectMode: boolean;

    // Selections
    sourceAlignGroups: RangeGroup[];
    destAlignGroups: RangeGroup[];
    sourceAblations: Set<number>;
    destAblations: Set<number>;
    connections: ConnectionPair[];

    // Derivatives
    sourceGroupCount: number;
    destGroupCount: number;
    notAligned: boolean;

    // Pending connect drag
    pendingConnect: { side: PatchSide; idx: number } | null;
}

interface PatchActions {
    setSourceText: (text: string) => void;
    setDestText: (text: string) => void;
    setIsEditing: (val: boolean) => void;

    toggleAlignMode: () => void;
    toggleAblateMode: () => void;
    toggleConnectMode: () => void;

    tokenizeBoth: () => void;
    clearSelections: () => void;

    // Align interactions
    beginAlignDrag: (side: PatchSide, idx: number) => void;
    updateAlignDrag: (side: PatchSide, idx: number) => void;
    endAlignDrag: (side: PatchSide) => void;

    // Ablation
    toggleAblationAt: (side: PatchSide, idx: number) => void;

    // Connect
    beginConnectAt: (side: PatchSide, idx: number) => void;
    attemptConnectTo: (side: PatchSide, idx: number) => void;
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

    // Edit view
    const [isEditing, _setIsEditing] = useState(true);

    // Tokens
    const [sourceTokens, setSourceTokens] = useState<Token[]>([]);
    const [destTokens, setDestTokens] = useState<Token[]>([]);

    // Modes
    const [isAlignMode, setAlignMode] = useState(false);
    const [isAblateMode, setAblateMode] = useState(false);
    const [isConnectMode, setConnectMode] = useState(false);

    // Selections
    const [sourceAlignGroups, setSourceAlignGroups] = useState<RangeGroup[]>([]);
    const [destAlignGroups, setDestAlignGroups] = useState<RangeGroup[]>([]);
    const [sourceAblations, setSourceAblations] = useState<Set<number>>(new Set());
    const [destAblations, setDestAblations] = useState<Set<number>>(new Set());
    const [connections, setConnections] = useState<ConnectionPair[]>([]);

    // Drag state (align)
    const alignDragStart = useRef<{ side: PatchSide; startIdx: number } | null>(null);

    // Pending connect
    const [pendingConnect, setPendingConnect] = useState<{ side: PatchSide; idx: number } | null>(null);

    // Derived group counts (for alignment validation)
    const computeGroupCount = useCallback((tokens: Token[], groups: RangeGroup[]): number => {
        if (tokens.length === 0) return 0;
        // Count highlighted groups + unhighlighted tokens not covered by a group
        const covered = new Array<boolean>(tokens.length).fill(false);
        for (const g of groups) {
            for (let i = g.start; i <= g.end; i++) covered[i] = true;
        }
        let count = 0;
        let i = 0;
        while (i < tokens.length) {
            if (covered[i]) {
                // advance to end of group
                count += 1;
                let j = i + 1;
                while (j < tokens.length && covered[j]) j++;
                i = j;
            } else {
                // individual unhighlighted token counts as 1
                count += 1;
                i += 1;
            }
        }
        return count;
    }, []);

    const sourceGroupCount = useMemo(
        () => computeGroupCount(sourceTokens, sourceAlignGroups),
        [sourceTokens, sourceAlignGroups, computeGroupCount]
    );
    const destGroupCount = useMemo(
        () => computeGroupCount(destTokens, destAlignGroups),
        [destTokens, destAlignGroups, computeGroupCount]
    );

    const notAligned = useMemo(() => isAlignMode && sourceGroupCount !== destGroupCount, [isAlignMode, sourceGroupCount, destGroupCount]);

    const clearSelections = useCallback(() => {
        setSourceAlignGroups([]);
        setDestAlignGroups([]);
        setSourceAblations(new Set());
        setDestAblations(new Set());
        setConnections([]);
        setPendingConnect(null);
    }, []);

    const resetForNewTokens = useCallback((src: Token[], dst: Token[]) => {
        setSourceTokens(src);
        setDestTokens(dst);
        clearSelections();
        // Auto-initialize alignment groups to diff regions
        if (src.length > 0 && dst.length > 0) {
            const { sourceGroups, destGroups } = computeInitialDiffGroups(src, dst);
            setSourceAlignGroups(sourceGroups);
            setDestAlignGroups(destGroups);
        }
    }, [clearSelections]);

    const tokenizeBoth = useCallback(() => {
        const a = sourceText.trim();
        const b = destText.trim();
        if (!a || !b) {
            toast("Please fill both prompts before tokenizing.");
            return;
        }
        const srcTokens = tokenizeLocal(a);
        const dstTokens = tokenizeLocal(b);
        resetForNewTokens(srcTokens, dstTokens);
        _setIsEditing(false);
    }, [sourceText, destText, resetForNewTokens]);

    const setIsEditing = useCallback((val: boolean) => {
        if (isEditing && !val) {
            // entering token view → auto-tokenize
            tokenizeBoth();
            return;
        }
        _setIsEditing(val);
    }, [isEditing, tokenizeBoth]);

    // Mode toggles with compatibility checks
    const toggleAlignMode = useCallback(() => {
        if (isAlignMode) {
            setAlignMode(false);
            return;
        }
        // If connect mode has any connections, require clearing first
        if (isConnectMode && connections.length > 0) {
            toast("Clear connections before switching to Align mode.");
            return;
        }
        if (isConnectMode) setConnectMode(false);
        setAlignMode(true);
    }, [isAlignMode, isConnectMode, connections.length]);

    const toggleConnectMode = useCallback(() => {
        if (isConnectMode) {
            setConnectMode(false);
            setPendingConnect(null);
            return;
        }
        // If align mode has any groups, require clearing first
        if (isAlignMode && (sourceAlignGroups.length > 0 || destAlignGroups.length > 0)) {
            toast("Clear alignment selections before switching to Connect mode.");
            return;
        }
        if (isAlignMode) setAlignMode(false);
        setConnectMode(true);
    }, [isConnectMode, isAlignMode, sourceAlignGroups.length, destAlignGroups.length]);

    const toggleAblateMode = useCallback(() => setAblateMode(prev => !prev), []);

    // Helpers
    const isIndexInGroups = (idx: number, groups: RangeGroup[]) => groups.some(g => idx >= g.start && idx <= g.end);
    const isIndexConnected = (idx: number, side: PatchSide) => {
        return side === "source"
            ? connections.some(c => c.sourceIdx === idx)
            : connections.some(c => c.destIdx === idx);
    };

    // Align interactions
    const beginAlignDrag = useCallback((side: PatchSide, idx: number) => {
        if (!isAlignMode) return;
        const tokens = side === "source" ? sourceTokens : destTokens;
        if (idx < 0 || idx >= tokens.length) return;
        // Cannot group if token is ablated or connected
        const ablations = side === "source" ? sourceAblations : destAblations;
        if (ablations.has(idx) || isIndexConnected(idx, side)) {
            toast("Token already used in another mode.");
            return;
        }
        alignDragStart.current = { side, startIdx: idx };
        // Initialize with a zero-length selection for instant feedback
        const newGroup: RangeGroup = { start: idx, end: idx };
        if (side === "source") setSourceAlignGroups(prev => [...prev.filter(g => !(g.start === newGroup.start && g.end === newGroup.end)), newGroup]);
        else setDestAlignGroups(prev => [...prev.filter(g => !(g.start === newGroup.start && g.end === newGroup.end)), newGroup]);
    }, [isAlignMode, sourceTokens, destTokens, sourceAblations, destAblations]);

    const updateAlignDrag = useCallback((side: PatchSide, idx: number) => {
        if (!isAlignMode) return;
        const start = alignDragStart.current;
        if (!start || start.side !== side) return;
        const [s, e] = start.startIdx <= idx ? [start.startIdx, idx] : [idx, start.startIdx];
        const ablations = side === "source" ? sourceAblations : destAblations;
        // Prevent extending into conflicting indices
        for (let k = s; k <= e; k++) {
            if (ablations.has(k) || isIndexConnected(k, side)) return;
        }
        const setGroups = side === "source" ? setSourceAlignGroups : setDestAlignGroups;
        setGroups(prev => {
            // Replace the last group if it matches the drag origin
            const next = [...prev];
            if (next.length === 0) return [{ start: s, end: e }];
            next[next.length - 1] = { start: s, end: e };
            return next;
        });
    }, [isAlignMode, sourceAblations, destAblations]);

    const endAlignDrag = useCallback((side: PatchSide) => {
        if (!isAlignMode) return;
        const start = alignDragStart.current;
        if (!start || start.side !== side) return;
        alignDragStart.current = null;
    }, [isAlignMode]);

    // Ablation toggle
    const toggleAblationAt = useCallback((side: PatchSide, idx: number) => {
        if (!isAblateMode) return;
        // Cannot ablate if grouped or connected
        const groups = side === "source" ? sourceAlignGroups : destAlignGroups;
        if (isIndexInGroups(idx, groups) || isIndexConnected(idx, side)) {
            toast("Token already used in another mode.");
            return;
        }
        if (side === "source") {
            setSourceAblations(prev => {
                const next = new Set(prev);
                if (next.has(idx)) next.delete(idx); else next.add(idx);
                return next;
            });
        } else {
            setDestAblations(prev => {
                const next = new Set(prev);
                if (next.has(idx)) next.delete(idx); else next.add(idx);
                return next;
            });
        }
    }, [isAblateMode, sourceAlignGroups, destAlignGroups]);

    // Connect interactions
    const beginConnectAt = useCallback((side: PatchSide, idx: number) => {
        if (!isConnectMode) return;
        // Cannot connect if grouped or ablated
        const groups = side === "source" ? sourceAlignGroups : destAlignGroups;
        const ablations = side === "source" ? sourceAblations : destAblations;
        if (isIndexInGroups(idx, groups) || ablations.has(idx)) {
            toast("Token already used in another mode.");
            return;
        }
        setPendingConnect({ side, idx });
    }, [isConnectMode, sourceAlignGroups, destAlignGroups, sourceAblations, destAblations]);

    const attemptConnectTo = useCallback((side: PatchSide, idx: number) => {
        if (!isConnectMode) return;
        const pending = pendingConnect;
        if (!pending) return;
        if (pending.side === side) {
            // same side mouseup cancels pending connection
            setPendingConnect(null);
            return;
        }
        // Cannot connect if grouped or ablated on target
        const groups = side === "source" ? sourceAlignGroups : destAlignGroups;
        const ablations = side === "source" ? sourceAblations : destAblations;
        if (isIndexInGroups(idx, groups) || ablations.has(idx)) {
            toast("Token already used in another mode.");
            setPendingConnect(null);
            return;
        }
        const pair: ConnectionPair = pending.side === "source" ? { sourceIdx: pending.idx, destIdx: idx } : { sourceIdx: idx, destIdx: pending.idx };
        // Prevent duplicates or multi-connections for same token
        if (isIndexConnected(pair.sourceIdx, "source") || isIndexConnected(pair.destIdx, "destination")) {
            toast("Each token can connect only once.");
            setPendingConnect(null);
            return;
        }
        setConnections(prev => [...prev, pair]);
        setPendingConnect(null);
    }, [isConnectMode, pendingConnect, sourceAlignGroups, destAlignGroups, sourceAblations, destAblations]);

    const value = useMemo(() => ({
        // state
        sourceText,
        destText,
        isEditing,
        sourceTokens,
        destTokens,
        isAlignMode,
        isAblateMode,
        isConnectMode,
        sourceAlignGroups,
        destAlignGroups,
        sourceAblations,
        destAblations,
        connections,
        sourceGroupCount,
        destGroupCount,
        notAligned,
        pendingConnect,
        // actions
        setSourceText,
        setDestText,
        setIsEditing,
        toggleAlignMode,
        toggleAblateMode,
        toggleConnectMode,
        tokenizeBoth,
        clearSelections,
        beginAlignDrag,
        updateAlignDrag,
        endAlignDrag,
        toggleAblationAt,
        beginConnectAt,
        attemptConnectTo,
    }), [
        sourceText,
        destText,
        isEditing,
        sourceTokens,
        destTokens,
        isAlignMode,
        isAblateMode,
        isConnectMode,
        sourceAlignGroups,
        destAlignGroups,
        sourceAblations,
        destAblations,
        connections,
        sourceGroupCount,
        destGroupCount,
        notAligned,
        pendingConnect,
        setSourceText,
        setDestText,
        setIsEditing,
        toggleAlignMode,
        toggleAblateMode,
        toggleConnectMode,
        tokenizeBoth,
        clearSelections,
        beginAlignDrag,
        updateAlignDrag,
        endAlignDrag,
        toggleAblationAt,
        beginConnectAt,
        attemptConnectTo,
    ]);

    return (
        <PatchContext.Provider value={value}>
            {children}
        </PatchContext.Provider>
    );
}