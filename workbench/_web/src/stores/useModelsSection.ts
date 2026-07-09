import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface ModelsSectionState {
    collapsed: boolean;
    setCollapsed: (v: boolean) => void;
    toggle: () => void;
    /** Becomes true after `persist` has read the saved value from localStorage.
     * Consumers gate first-paint rendering on this so users who saved
     * `collapsed: true` don't see a flash of the expanded layout before the
     * persisted value lands. */
    _hasHydrated: boolean;
    _setHasHydrated: (v: boolean) => void;
}

/**
 * Shared "is the models section on the workspace list page collapsed?"
 * Persisted so the preference survives reloads. Read from sibling components
 * (currently WorkspaceList) so they can adapt their own layout — e.g. show
 * more workspace rows when the section is collapsed and there's more room.
 */
export const useModelsSection = create<ModelsSectionState>()(
    persist(
        (set, get) => ({
            collapsed: false,
            _hasHydrated: false,
            setCollapsed: (v) => set({ collapsed: v }),
            toggle: () => set({ collapsed: !get().collapsed }),
            _setHasHydrated: (v) => set({ _hasHydrated: v }),
        }),
        {
            name: "workbench:models-section",
            storage: createJSONStorage(() => localStorage),
            // `collapsed` is the only durable piece; never persist the
            // hydration flag itself.
            partialize: (s) => ({ collapsed: s.collapsed }),
            onRehydrateStorage: () => (state) => {
                state?._setHasHydrated(true);
            },
        },
    ),
);
