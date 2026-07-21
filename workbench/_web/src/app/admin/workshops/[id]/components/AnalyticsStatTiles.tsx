"use client";

import type { WorkshopAnalytics } from "@/lib/queries/workshopAnalyticsDb";

/** One KPI tile — matches the WorkshopRow card shape (rounded-md, one radius). */
function Tile({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-md border bg-card p-4 shadow-xs">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        </div>
    );
}

/**
 * Completion % = participants who completed the final unit ÷ participants who
 * started the first unit (0 when nobody has started — avoids NaN).
 */
function completionPct(analytics: WorkshopAnalytics): number {
    const funnel = analytics.tutorial.funnel;
    if (funnel.length === 0) return 0;
    const firstStarted = funnel[0].started;
    const lastCompleted = funnel[funnel.length - 1].completed;
    if (firstStarted === 0) return 0;
    return Math.round((lastCompleted / firstStarted) * 100);
}

export function AnalyticsStatTiles({ analytics }: { analytics: WorkshopAnalytics }) {
    const { totals } = analytics;
    return (
        <div
            data-testid="analytics-stat-tiles"
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
        >
            <Tile label="Participants" value={totals.participants} />
            <Tile label="Active" value={totals.activeParticipants} />
            <Tile label="Lens runs" value={totals.lensRuns} />
            <Tile label="Tutorial completion" value={`${completionPct(analytics)}%`} />
            <Tile label="Prolific-attributed" value={totals.prolificAttributed} />
        </div>
    );
}
