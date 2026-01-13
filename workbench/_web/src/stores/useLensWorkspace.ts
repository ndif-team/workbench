import { create } from "zustand";
import type { LogitLensWidgetInterface, PinnedGroup, SerializedPinnedRow } from "@/components/charts/logitlens/LogitLensWidgetEmbed";

interface LensWorkspaceState {
    highlightedLineIds: Set<string>;
    setHighlightedLineIds: (highlightedLineIds: Set<string>) => void;

    toggleLineHighlight: (lineId: string) => void;
    clearHighlightedLineIds: () => void;

    // Widget state
    widgetRef: LogitLensWidgetInterface | null;
    setWidgetRef: (widget: LogitLensWidgetInterface | null) => void;
    pinnedRows: SerializedPinnedRow[];
    setPinnedRows: (rows: SerializedPinnedRow[]) => void;
    pinnedGroups: PinnedGroup[];
    setPinnedGroups: (groups: PinnedGroup[]) => void;

    // Tracked tokens from widget data (available for autocomplete)
    trackedTokens: string[];
    setTrackedTokens: (tokens: string[]) => void;

    // Widget actions
    togglePinnedRow: (pos: number) => boolean;
    togglePinnedTrajectory: (token: string, addToGroup?: boolean) => boolean;

    // Visibility and metric state
    showHeatmap: boolean;
    setShowHeatmap: (show: boolean) => void;
    showChart: boolean;
    setShowChart: (show: boolean) => void;
    trajectoryMetric: "prob" | "rank";
    setTrajectoryMetric: (metric: "prob" | "rank") => void;
    hasRankData: () => boolean;

    // Hover state for synchronization with TokenArea
    hoveredRow: number | null;
    setHoveredRow: (pos: number | null) => void;
    hoverRow: (pos: number) => void;
    clearHover: () => void;
}

export const useLensWorkspace = create<LensWorkspaceState>()((set, get) => ({
    highlightedLineIds: new Set(),
    setHighlightedLineIds: (highlightedLineIds: Set<string>) => set({ highlightedLineIds }),

    toggleLineHighlight: (lineId: string) =>
        set((state) => {
            const newHighlightedLineIds = new Set(state.highlightedLineIds);
            if (state.highlightedLineIds.has(lineId)) {
                newHighlightedLineIds.delete(lineId);
            } else {
                newHighlightedLineIds.add(lineId);
            }
            return { highlightedLineIds: newHighlightedLineIds };
        }),

    clearHighlightedLineIds: () => set({ highlightedLineIds: new Set() }),

    // Widget state
    widgetRef: null,
    setWidgetRef: (widget) => set({ widgetRef: widget }),
    pinnedRows: [],
    setPinnedRows: (rows) => set({ pinnedRows: rows }),
    pinnedGroups: [],
    setPinnedGroups: (groups) => set({ pinnedGroups: groups }),
    trackedTokens: [],
    setTrackedTokens: (tokens) => set({ trackedTokens: tokens }),

    // Widget actions - proxy to widget
    togglePinnedRow: (pos) => {
        const { widgetRef } = get();
        if (widgetRef) {
            return widgetRef.togglePinnedRow(pos);
        }
        return false;
    },
    togglePinnedTrajectory: (token, addToGroup = false) => {
        const { widgetRef } = get();
        if (widgetRef) {
            return widgetRef.togglePinnedTrajectory(token, addToGroup);
        }
        return false;
    },

    // Visibility and metric state
    showHeatmap: true,
    setShowHeatmap: (show) => {
        const { widgetRef } = get();
        if (widgetRef) {
            widgetRef.setShowHeatmap(show);
        }
        set({ showHeatmap: show });
    },
    showChart: true,
    setShowChart: (show) => {
        const { widgetRef } = get();
        if (widgetRef) {
            widgetRef.setShowChart(show);
        }
        set({ showChart: show });
    },
    trajectoryMetric: "prob",
    setTrajectoryMetric: (metric) => {
        const { widgetRef } = get();
        if (widgetRef) {
            widgetRef.setTrajectoryMetric(metric);
        }
        set({ trajectoryMetric: metric });
    },
    hasRankData: () => {
        const { widgetRef } = get();
        if (widgetRef) {
            return widgetRef.hasRankData();
        }
        return false;
    },

    // Hover state for synchronization with TokenArea
    hoveredRow: null,
    setHoveredRow: (pos) => set({ hoveredRow: pos }),
    hoverRow: (pos) => {
        const { widgetRef } = get();
        if (widgetRef) {
            widgetRef.hoverRow(pos);
        }
        set({ hoveredRow: pos });
    },
    clearHover: () => {
        const { widgetRef } = get();
        if (widgetRef) {
            widgetRef.clearHover();
        }
        set({ hoveredRow: null });
    },
}));
