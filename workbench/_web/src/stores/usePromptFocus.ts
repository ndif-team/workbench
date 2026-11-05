import { create } from "zustand";

interface PromptFocusState {
    /** The new chart whose prompt should take focus once its page can take input. */
    chartId: string | null;
    request: (chartId: string) => void;
    clear: () => void;
}

/**
 * A one-shot hand-off from `/new` to the chart it opens: the chart's Controls
 * focus its empty prompt (`useFocusNewChartPrompt`), so New chart lands the
 * cursor where the user types next.
 */
export const usePromptFocus = create<PromptFocusState>()((set) => ({
    chartId: null,
    request: (chartId) => set({ chartId }),
    clear: () => set({ chartId: null }),
}));
