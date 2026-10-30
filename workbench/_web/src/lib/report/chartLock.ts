/**
 * Locking a chart embed: the report keeps the chart's view state as it was
 * when locked — the lens `uiState`, or the activation patching mode and token
 * selection — so later changes on the chart's page don't reach the embed.
 *
 * Only the view state is kept (a few hundred bytes), not the results: those
 * can run to megabytes, and the whole report is saved on every edit. A
 * fingerprint of the results at lock time tells the embed whether the chart
 * was re-run since.
 */

/** The config fields that set how a chart is viewed. */
const VIEW_FIELDS = ["uiState", "selectedMode", "selectedLineIndices"] as const;

export type ChartView = Partial<Record<(typeof VIEW_FIELDS)[number], unknown>>;

export type ChartLock = {
    /** The view state when the embed was locked. */
    view: ChartView;
    /** When it was locked, epoch ms. */
    at: number;
    /** Fingerprint of the chart's results when it was locked. */
    data: string;
};

type Row = { type?: string | null; data?: unknown } | null | undefined;

/** The view fields of a config row's data (only those it has). */
export function chartView(config: Row): ChartView {
    const data = (config?.data ?? {}) as Record<string, unknown>;
    const view: ChartView = {};
    for (const field of VIEW_FIELDS) if (data[field] !== undefined) view[field] = data[field];
    return view;
}

/** `config` with its view fields replaced by `view`'s. A field the view lacks
 *  (the chart had none saved when locked) is cleared, not taken live. */
export function withView<T extends Row>(config: T, view: ChartView): T {
    const data = { ...((config?.data ?? {}) as Record<string, unknown>) };
    for (const field of VIEW_FIELDS) {
        if (view[field] === undefined) delete data[field];
        else data[field] = view[field];
    }
    return { ...(config ?? {}), data } as T;
}

/** A short, stable fingerprint of a chart's results (FNV-1a over its JSON). */
export function dataFingerprint(data: unknown): string {
    const text = JSON.stringify(data ?? null);
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return `${(hash >>> 0).toString(16)}:${text.length}`;
}

/** Lock a chart at its current view state and results. */
export function lockChart(chart: Row, config: Row, now = Date.now()): ChartLock {
    return { view: chartView(config), at: now, data: dataFingerprint(chart?.data) };
}

/** Whether the chart's results changed since it was locked (it was re-run). */
export function rerunSinceLock(lock: ChartLock, chart: Row): boolean {
    return !!chart && lock.data !== dataFingerprint(chart.data);
}

/** The key a report gives one embed: its chart, and the lock if it has one
 *  (the same chart may be embedded twice, locked and live). */
export function embedKey(chartId: string, lock: ChartLock | null | undefined): string {
    return lock ? `${chartId}@${lock.at}` : chartId;
}
