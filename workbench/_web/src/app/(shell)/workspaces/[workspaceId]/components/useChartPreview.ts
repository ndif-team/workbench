"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { snapshotChart, type ChartSnapshot } from "nnsightful";

import { useIsDark } from "@/hooks/useIsDark";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { chartFigure, type ChartFigureGap } from "@/lib/report/chartFigure";

export type ChartPreview =
    | { status: "loading" }
    | { status: "ready"; image: ChartSnapshot }
    | { status: "gap"; gap: ChartFigureGap }
    | { status: "failed" };

/**
 * Draws chart previews, a couple at a time: each one lays a chart out
 * offscreen and captures it, so drawing a whole folder at once would stall
 * the page.
 */
class PreviewQueue {
    static readonly CONCURRENCY = 2;
    /** Width a preview is laid out at, CSS px; its card scales it to fit. */
    static readonly WIDTH = 560;
    /** Logit lens rows a preview shows: the window the chart's own view picks. */
    static readonly MAX_ROWS = 8;
    /** Pixel density, so the scaled-down image stays sharp on dense screens. */
    static readonly SCALE = 2;

    private static running = 0;
    private static waiting: (() => void)[] = [];

    /** Runs `task` once a slot is free; a finished task hands its slot to the next. */
    static async run<T>(task: () => Promise<T>): Promise<T> {
        if (PreviewQueue.running < PreviewQueue.CONCURRENCY) PreviewQueue.running++;
        else await new Promise<void>((resolve) => PreviewQueue.waiting.push(resolve));
        try {
            return await task();
        } finally {
            const next = PreviewQueue.waiting.shift();
            if (next) next();
            else PreviewQueue.running--;
        }
    }
}

/**
 * A chart's preview for its card, drawn from its saved data and view the way
 * a report embed draws it, once `enabled` (the card is on screen and the
 * chart has a result). The chart and config come from the queries the
 * chart's page uses, so the preview follows edits made there; each image is
 * cached for that version of the chart and the theme.
 */
export function useChartPreview(chartId: string, enabled: boolean): ChartPreview {
    const darkMode = useIsDark();
    const chartQuery = useQuery({
        queryKey: queryKeys.charts.chart(chartId),
        queryFn: () => getChartById(chartId),
        enabled,
    });
    const configQuery = useQuery({
        queryKey: queryKeys.charts.configByChart(chartId),
        queryFn: () => getConfigForChart(chartId),
        enabled,
    });
    const chart = chartQuery.data;
    const config = configQuery.data;
    const loaded = chartQuery.isSuccess && configQuery.isSuccess;
    const figure = useMemo(
        () => (loaded ? chartFigure(chart, config) : null),
        [loaded, chart, config],
    );
    const spec = figure?.spec;
    // A run bumps the chart's updatedAt; its view lives in the (small) config,
    // which has no timestamp of its own.
    const version = `${chart?.updatedAt?.valueOf()}:${JSON.stringify(config?.data ?? null)}`;

    const imageQuery = useQuery({
        queryKey: queryKeys.charts.preview(chartId, version, darkMode),
        queryFn: () =>
            PreviewQueue.run(() =>
                snapshotChart(spec!, {
                    width: PreviewQueue.WIDTH,
                    maxRows: PreviewQueue.MAX_ROWS,
                    scale: PreviewQueue.SCALE,
                    darkMode,
                }),
            ),
        enabled: !!spec,
        staleTime: Infinity,
        gcTime: 30 * 60_000,
        retry: false,
    });

    if (chartQuery.isError || configQuery.isError || imageQuery.isError) {
        return { status: "failed" };
    }
    if (figure?.gap) return { status: "gap", gap: figure.gap };
    if (imageQuery.data) return { status: "ready", image: imageQuery.data };
    return { status: "loading" };
}

/**
 * A ref for an element and whether it has been on screen (inside its
 * scrolling ancestors' clip, too); true from then on.
 */
export function useSeenOnScreen<T extends Element>(): [(el: T | null) => void, boolean] {
    const [seen, setSeen] = useState(false);
    const observer = useRef<IntersectionObserver | null>(null);

    const ref = useCallback(
        (el: T | null) => {
            observer.current?.disconnect();
            if (!el || seen) return;
            observer.current = new IntersectionObserver(([entry]) => {
                if (!entry?.isIntersecting) return;
                setSeen(true);
                observer.current?.disconnect();
            });
            observer.current.observe(el);
        },
        [seen],
    );
    useEffect(() => () => observer.current?.disconnect(), []);

    return [ref, seen];
}
