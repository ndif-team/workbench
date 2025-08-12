import { create } from 'zustand';
import type { Model } from '@/types/models';

interface WorkspaceState {
    jobStatus: string;
    setJobStatus: (jobStatus: string) => void;

    annotationsOpen: boolean;
    setAnnotationsOpen: (annotationsOpen: boolean) => void;

    selectedModel: Model | null;
    setSelectedModel: (model: Model | null) => void;

    thumbnailChartId: string | null;
    thumbnailCaptureNonce: number;
    requestThumbnailCapture: (chartId: string) => void;
    clearThumbnailRequest: () => void;
}

export const useWorkspace = create<WorkspaceState>()((set, get) => ({
    jobStatus: "idle",
    setJobStatus: (jobStatus: string) => set({ jobStatus }),

    annotationsOpen: true,
    setAnnotationsOpen: (annotationsOpen: boolean) => set({ annotationsOpen }),

    selectedModel: null,
    setSelectedModel: (model: Model | null) => set({ selectedModel: model }),

    thumbnailChartId: null,
    thumbnailCaptureNonce: 0,
    requestThumbnailCapture: (chartId: string) => {
        set({ thumbnailChartId: chartId, thumbnailCaptureNonce: get().thumbnailCaptureNonce + 1 });
    },
    clearThumbnailRequest: () => set({ thumbnailChartId: null }),
}));