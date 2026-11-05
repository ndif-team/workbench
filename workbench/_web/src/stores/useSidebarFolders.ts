import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** The global sidebar's two collapsible sections. */
type SidebarSection = "workspaces" | "charts";

interface SidebarFoldersState {
    /** Workspace ids whose folder is expanded in the global sidebar. */
    expanded: string[];
    toggle: (workspaceId: string) => void;
    expand: (workspaceId: string) => void;
    /** Drops ids of workspaces that no longer exist. */
    prune: (existingIds: readonly string[]) => void;
    /** Sections folded away under their header. */
    collapsedSections: SidebarSection[];
    toggleSection: (section: SidebarSection) => void;
    /** Whether the Workspaces section lists every folder rather than the first few. */
    showAllFolders: boolean;
    setShowAllFolders: (showAll: boolean) => void;
}

/**
 * How the global sidebar was left: which workspace folders are expanded,
 * which sections are folded, and whether every folder is listed. Persisted so
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
            collapsedSections: [],
            toggleSection: (section) =>
                set({
                    collapsedSections: get().collapsedSections.includes(section)
                        ? get().collapsedSections.filter((s) => s !== section)
                        : [...get().collapsedSections, section],
                }),
            showAllFolders: false,
            setShowAllFolders: (showAllFolders) => set({ showAllFolders }),
        }),
        {
            name: "workbench:sidebar-folders",
            storage: createJSONStorage(() => localStorage),
            partialize: (s) => ({
                expanded: s.expanded,
                collapsedSections: s.collapsedSections,
                showAllFolders: s.showAllFolders,
            }),
        },
    ),
);
