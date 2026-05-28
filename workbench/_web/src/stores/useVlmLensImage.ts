/**
 * In-memory store for VLM-lens input images, keyed by chartId.
 *
 * The image is sent to the backend on each run but NOT persisted in the
 * chart's `data` jsonb (per CVPR2026-HOW project decision). So we keep
 * the upload in this store for the duration of the browser session — the
 * Controls panel writes it on upload, the Display reads it for the
 * segmentation widget. Cleared on page reload; the lens table still
 * renders from the persisted chart data, the segmentation widget just
 * shows a "re-attach image" placeholder until the user re-uploads.
 */

import { create } from "zustand";

export interface VlmLensImageEntry {
    /** Raw base64, no data: prefix. */
    b64: string;
    /** data: URL form for direct <img src=...>. */
    dataUrl: string;
    /** Original filename, for display only. */
    filename: string;
    /** MIME type as reported by the browser at upload time. */
    mimeType: string;
}

interface VlmLensImageState {
    byChart: Record<string, VlmLensImageEntry>;
    set: (chartId: string, entry: VlmLensImageEntry) => void;
    clear: (chartId: string) => void;
    get: (chartId: string) => VlmLensImageEntry | undefined;
}

export const useVlmLensImage = create<VlmLensImageState>()((set, get) => ({
    byChart: {},
    set: (chartId, entry) =>
        set((state) => ({ byChart: { ...state.byChart, [chartId]: entry } })),
    clear: (chartId) =>
        set((state) => {
            const next = { ...state.byChart };
            delete next[chartId];
            return { byChart: next };
        }),
    get: (chartId) => get().byChart[chartId],
}));
