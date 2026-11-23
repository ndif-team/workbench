import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type WorkspaceView = "grid" | "list";

interface WorkspaceViewState {
    /** How a workspace page lays out its charts, chats and reports. */
    view: WorkspaceView;
    setView: (view: WorkspaceView) => void;
}

/**
 * The workspace page's layout: a grid of preview cards (the default) or a
 * list of rows. Persisted, so every workspace opens the way the last one was
 * left.
 */
export const useWorkspaceView = create<WorkspaceViewState>()(
    persist(
        (set) => ({
            view: "grid",
            setView: (view) => set({ view }),
        }),
        {
            name: "workbench:workspace-view",
            storage: createJSONStorage(() => localStorage),
        },
    ),
);
