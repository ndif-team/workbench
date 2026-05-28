/**
 * Cross-panel interactive view state for the VLM Logit Lens.
 *
 * The image-hover widget and the segmentation widget live in the LEFT
 * (input) panel; the lens table lives in the RIGHT (display) panel. They
 * need to share state — hovering a table cell highlights the matching
 * patch on the images, hovering a patch on the segmentation outlines the
 * row in the table, etc. — so the state is hoisted into a zustand store
 * keyed by chartId.
 */

import { create } from "zustand";

export interface VlmViewState {
    hoveredPos: number | null;
    hoveredLayer: number | null; // which layer the tooltip should display top-5 for
    isLocked: boolean;
    selectedLayer: number; // segmentation's slider position (0-indexed)
    threshold: number; // segmentation min-p
    colorOverrides: Record<string, string>;
}

export const defaultViewState = (numLayers: number): VlmViewState => ({
    hoveredPos: null,
    hoveredLayer: null,
    isLocked: false,
    selectedLayer: Math.max(0, numLayers - 1),
    threshold: 0.1,
    colorOverrides: {},
});

interface ViewStore {
    byChart: Record<string, VlmViewState>;
    ensure: (chartId: string, numLayers: number) => void;
    patch: (chartId: string, p: Partial<VlmViewState>) => void;
    setOverride: (chartId: string, token: string, rgba: string) => void;
}

export const useVlmLensView = create<ViewStore>()((set) => ({
    byChart: {},
    ensure: (chartId, numLayers) =>
        set((state) => {
            if (state.byChart[chartId]) return {};
            return {
                byChart: { ...state.byChart, [chartId]: defaultViewState(numLayers) },
            };
        }),
    patch: (chartId, p) =>
        set((state) => {
            const cur = state.byChart[chartId] ?? defaultViewState(0);
            return { byChart: { ...state.byChart, [chartId]: { ...cur, ...p } } };
        }),
    setOverride: (chartId, token, rgba) =>
        set((state) => {
            const cur = state.byChart[chartId] ?? defaultViewState(0);
            return {
                byChart: {
                    ...state.byChart,
                    [chartId]: {
                        ...cur,
                        colorOverrides: { ...cur.colorOverrides, [token]: rgba },
                    },
                },
            };
        }),
}));

