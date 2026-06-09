import { useCallback, useRef } from "react";

/**
 * Schedule a callback to run after a short blur delay (default 100ms), with
 * cancellation. Used by the Controls components to debounce auto-tokenize
 * after a textarea blur, AND to cancel that pending call when Reset or Sync
 * fires before the timer elapses.
 *
 * Without the explicit cancel, a stale `handleTokenize` closure captured by
 * the blur handler would run after Reset has restored state, overwriting it
 * with the user's draft prompt.
 */
export function useBlurTokenizeScheduler() {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const schedule = useCallback((fn: () => void, delay: number = 100) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            fn();
        }, delay);
    }, []);

    const cancel = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    return { schedule, cancel };
}
