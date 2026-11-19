import { create } from "zustand";

interface PromptFocusState {
    /** The new chart or chat whose prompt should take focus once its page can take input. */
    itemId: string | null;
    request: (itemId: string) => void;
    clear: () => void;
}

/**
 * A one-shot hand-off from a launch to the chart or chat it opens: a blank
 * chart's Controls focus its empty prompt (`useFocusNewChartPrompt`), and a
 * chat started from Home's composer focuses its own, so the cursor lands
 * where the user types next.
 */
export const usePromptFocus = create<PromptFocusState>()((set) => ({
    itemId: null,
    request: (itemId) => set({ itemId }),
    clear: () => set({ itemId: null }),
}));
