import { create } from "zustand";

interface WorkspaceState {
    jobStatus: string;
    setJobStatus: (jobStatus: string) => void;

    /** The header's model, by name; null until a page picks one. Read it
     * through `selectedModelIn`, which falls back to the default model. */
    selectedModel: string | null;
    setSelectedModel: (model: string | null) => void;
}

export const useWorkspace = create<WorkspaceState>()((set) => ({
    jobStatus: "Idle",
    setJobStatus: (jobStatus: string) => set({ jobStatus }),

    selectedModel: null,
    setSelectedModel: (selectedModel) => set({ selectedModel }),
}));
