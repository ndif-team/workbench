import { create } from "zustand";
import type { Model } from "@/types/models";

interface WorkspaceState {
    jobStatus: string;
    setJobStatus: (jobStatus: string) => void;

    selectedModelIdx: number;
    setSelectedModelIdx: (modelIdx: number) => void;
}

export const useWorkspace = create<WorkspaceState>()((set, get) => ({
    jobStatus: "Idle",
    setJobStatus: (jobStatus: string) => set({ jobStatus }),

    selectedModelIdx: 0,
    setSelectedModelIdx: (modelIdx: number) => set({ selectedModelIdx: modelIdx }),
}));
