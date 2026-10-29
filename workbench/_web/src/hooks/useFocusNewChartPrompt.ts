import { useEffect, type RefObject } from "react";

import { usePromptFocus } from "@/stores/usePromptFocus";

/**
 * Focuses the chart's prompt input once it is `ready` (rendered, enabled and
 * empty) when `/new` asked for it (`usePromptFocus`). The request is used up
 * on the first focus.
 */
export function useFocusNewChartPrompt(
    chartId: string,
    inputRef: RefObject<HTMLTextAreaElement | null>,
    ready: boolean,
) {
    const requested = usePromptFocus((s) => s.chartId === chartId);
    useEffect(() => {
        if (!requested || !ready) return;
        usePromptFocus.getState().clear();
        inputRef.current?.focus();
    }, [requested, ready, inputRef]);
}
