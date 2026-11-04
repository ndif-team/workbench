import { create } from "zustand";

import type { ChartLaunchRequest } from "@/lib/chartLaunch";

/** A chart launched from inside the app that is still being created. */
type PendingChart = {
    /** Tells this launch apart from earlier ones. */
    id: number;
    request: ChartLaunchRequest;
    /** The path of the page it was launched from. */
    from: string;
};

interface PendingChartState {
    pending: PendingChart | null;
    /** Launches started so far; numbers each new one. */
    launches: number;
    /** Marks a chart as being created; returns its launch id. */
    start: (chart: Omit<PendingChart, "id">) => number;
    /** Ends launch `id`, or whichever is pending when no id is given. */
    clear: (id?: number) => void;
}

/**
 * The chart `useLaunchChart` is creating, which the shell shows as its empty
 * page (`PendingChartPage`) in place of the page it was launched from, until
 * the chart's own page opens. The shell clears it when the page changes, so a
 * launch whose user went elsewhere meanwhile no longer opens.
 */
export const usePendingChart = create<PendingChartState>()((set, get) => ({
    pending: null,
    launches: 0,
    start: (chart) => {
        const id = get().launches + 1;
        set({ launches: id, pending: { ...chart, id } });
        return id;
    },
    clear: (id) => {
        if (id === undefined || get().pending?.id === id) set({ pending: null });
    },
}));
