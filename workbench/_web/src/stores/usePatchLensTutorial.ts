import { create } from "zustand";

// v2: the tutorial was split into "Reading the lens" (auto-run) +
// "Activation patching" (manual); bumping the key re-triggers the auto-run
// once for users who completed the old single-chapter version.
const STORAGE_KEY = "workbench:patch-lens-tutorial-completed:v2";

interface PatchLensTutorialState {
    completed: boolean;
    markCompleted: () => void;
    reset: () => void;
}

function readCompleted(): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "true";
}

export const usePatchLensTutorial = create<PatchLensTutorialState>()((set) => ({
    completed: false,
    markCompleted: () => {
        if (typeof window !== "undefined") {
            localStorage.setItem(STORAGE_KEY, "true");
        }
        set({ completed: true });
    },
    reset: () => {
        if (typeof window !== "undefined") {
            localStorage.removeItem(STORAGE_KEY);
        }
        set({ completed: false });
    },
}));

/**
 * Hydrate from localStorage on the client. Call once at mount in a client
 * component.
 */
export function hydratePatchLensTutorial() {
    usePatchLensTutorial.setState({ completed: readCompleted() });
}
