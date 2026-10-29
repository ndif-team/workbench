import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface SidebarFoldersState {
    /** Workspace ids whose folder is expanded in the global sidebar. */
    expanded: string[];
    toggle: (workspaceId: string) => void;
    expand: (workspaceId: string) => void;
    /** Drops ids of workspaces that no longer exist. */
    prune: (existingIds: readonly string[]) => void;
}

/**
 * Which workspace folders are expanded in the global sidebar. Persisted so
 * the sidebar reopens the way it was left.
 */
export const useSidebarFolders = create<SidebarFoldersState>()(
    persist(
        (set, get) => ({
            expanded: [],
            toggle: (id) =>
                set({
                    expanded: get().expanded.includes(id)
                        ? get().expanded.filter((x) => x !== id)
                        : [...get().expanded, id],
                }),
            expand: (id) => {
                if (!get().expanded.includes(id)) set({ expanded: [...get().expanded, id] });
            },
            prune: (existingIds) => {
                const kept = get().expanded.filter((id) => existingIds.includes(id));
                if (kept.length !== get().expanded.length) set({ expanded: kept });
            },
        }),
        {
            name: "workbench:sidebar-folders",
            storage: createJSONStorage(() => localStorage),
            partialize: (s) => ({ expanded: s.expanded }),
        },
    ),
);
