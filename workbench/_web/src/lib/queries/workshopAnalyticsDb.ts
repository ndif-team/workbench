import { db } from "@/db/client";
import { workspaces, charts, documents, lensRuns } from "@/db/schema";
import type { ProlificParams } from "@/lib/prolific";
import {
    getTutorialEventsForWorkshop,
    deriveFunnel,
    deriveObservations,
    deriveProgressByWorkspace,
    deriveChecks,
    deriveCheckStats,
} from "@/lib/queries/tutorialEventsDb";
import type {
    StepFunnelRow,
    ObservationRow,
    CheckAnswerRow,
    CheckStatRow,
} from "@/lib/queries/tutorialEventsDb";
import { eq, inArray, sql } from "drizzle-orm";

/**
 * Unguarded workshop-analytics DB internals. The requireAdmin()-wrapped RPC
 * surface lives in workshopAnalyticsQueries.ts; keeping the internals here makes
 * them directly testable under bun:test and mirrors workshopDb/workshopQueries.
 *
 * Composed from a few grouped queries rather than one mega-join (clearer, each
 * testable). Time-series bucketing is done in TS from raw timestamps so it works
 * identically on both dialects (no date_trunc fork). Per-workshop volumes are
 * modest, so fetching lens_runs / tutorial_events rows and aggregating in TS is
 * fine.
 */

export interface ParticipantAnalyticsRow {
    workspaceId: string;
    userIdShort: string;
    prolificPid: string | null;
    // Full Prolific triple, exported so checks/observations can be joined to the
    // survey on any of them (PID is the usual key).
    studyId: string | null;
    sessionId: string | null;
    charts: number;
    lensRuns: number;
    modelsUsed: string[];
    lastActiveAt: Date;
    furthestStepId: string | null;
    hintsUsed: number;
}

export interface DayBucket {
    date: string; // YYYY-MM-DD (UTC)
    count: number;
}

export interface WorkshopAnalytics {
    totals: {
        participants: number;
        activeParticipants: number;
        lensRuns: number;
        charts: number;
        documents: number;
        prolificAttributed: number;
    };
    series: {
        joinsPerDay: DayBucket[];
        runsPerDay: DayBucket[];
    };
    participants: ParticipantAnalyticsRow[];
    tutorial: {
        funnel: StepFunnelRow[];
        observations: ObservationRow[];
        checks: CheckAnswerRow[];
        checkStats: CheckStatRow[];
        // id → human title for the workshop's tutorial units, so the funnel and
        // participant table label steps from DB content rather than a hard-coded
        // id map (which only covers the demo's unit ids). Empty when unknown.
        stepLabels: Record<string, string>;
        // Canonical first / last unit ids (from the workshop's step order),
        // distinct from the funnel's first/last rows, which are only the steps
        // that produced events. The completion KPI divides the final step's
        // completions by the FIRST step's starts — using these ids, not funnel
        // positions, so a first unit with missing telemetry can't shrink the
        // denominator and overstate completion.
        firstStepId: string | null;
        finalStepId: string | null;
    };
}

/** UTC day key; deterministic and dialect-agnostic (drizzle hands us Dates). */
const dayKey = (d: Date): string => new Date(d).toISOString().slice(0, 10);

/** Count Dates into sorted YYYY-MM-DD buckets. */
export const bucketByDay = (dates: Date[]): DayBucket[] => {
    const counts = new Map<string, number>();
    for (const d of dates) {
        const k = dayKey(d);
        counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));
};

const empty = (): WorkshopAnalytics => ({
    totals: {
        participants: 0,
        activeParticipants: 0,
        lensRuns: 0,
        charts: 0,
        documents: 0,
        prolificAttributed: 0,
    },
    series: { joinsPerDay: [], runsPerDay: [] },
    participants: [],
    tutorial: {
        funnel: [],
        observations: [],
        checks: [],
        checkStats: [],
        stepLabels: {},
        firstStepId: null,
        finalStepId: null,
    },
});

export const getWorkshopAnalytics = async (
    workshopId: string,
    stepOrder?: readonly string[],
    stepLabels?: Record<string, string>,
): Promise<WorkshopAnalytics> => {
    // 1. Participant workspaces (a join = one workspaces row for the workshop).
    const wsRows = (await db
        .select({
            id: workspaces.id,
            userId: workspaces.userId,
            prolific: workspaces.prolific,
            createdAt: workspaces.createdAt,
            updatedAt: workspaces.updatedAt,
        })
        .from(workspaces)
        .where(eq(workspaces.workshopId, workshopId))) as Array<{
        id: string;
        userId: string;
        prolific: ProlificParams | null;
        createdAt: Date;
        updatedAt: Date;
    }>;

    if (wsRows.length === 0) return empty();
    const wsIds = wsRows.map((w) => w.id);

    // 2. Per-workspace chart counts + total documents (grouped; cast to defeat
    //    the dual-schema `any` widening, same as listWorkshops/getWorkspaces).
    const [chartCountRows, docCountRows, runRows, tutorialEvents] = await Promise.all([
        db
            .select({
                workspaceId: charts.workspaceId,
                count: sql<number>`cast(count(*) as integer)`,
            })
            .from(charts)
            .where(inArray(charts.workspaceId, wsIds))
            .groupBy(charts.workspaceId) as Promise<Array<{ workspaceId: string; count: number }>>,
        db
            .select({
                workspaceId: documents.workspaceId,
                count: sql<number>`cast(count(*) as integer)`,
            })
            .from(documents)
            .where(inArray(documents.workspaceId, wsIds))
            .groupBy(documents.workspaceId) as Promise<
            Array<{ workspaceId: string; count: number }>
        >,
        // Raw lens_runs rows (workspace, model, time) — aggregated in TS for the
        // active set, per-participant counts, models used, and the runs/day series.
        db
            .select({
                workspaceId: lensRuns.workspaceId,
                model: lensRuns.model,
                createdAt: lensRuns.createdAt,
            })
            .from(lensRuns)
            .where(inArray(lensRuns.workspaceId, wsIds)) as Promise<
            Array<{ workspaceId: string; model: string; createdAt: Date }>
        >,
        // Depends only on workshopId (not wsIds), so it parallelizes with the
        // per-workspace rollups instead of costing an extra serialized round-trip.
        getTutorialEventsForWorkshop(workshopId),
    ]);

    const chartCountByWs = new Map(chartCountRows.map((r) => [r.workspaceId, Number(r.count)]));
    const documentsTotal = docCountRows.reduce((sum, r) => sum + Number(r.count), 0);

    // Per-workspace lens_run rollup.
    const runCountByWs = new Map<string, number>();
    const modelsByWs = new Map<string, Set<string>>();
    const lastRunByWs = new Map<string, Date>();
    for (const r of runRows) {
        runCountByWs.set(r.workspaceId, (runCountByWs.get(r.workspaceId) ?? 0) + 1);
        if (!modelsByWs.has(r.workspaceId)) modelsByWs.set(r.workspaceId, new Set());
        modelsByWs.get(r.workspaceId)!.add(r.model);
        const prev = lastRunByWs.get(r.workspaceId);
        if (!prev || r.createdAt > prev) lastRunByWs.set(r.workspaceId, r.createdAt);
    }

    // 3. Tutorial events (fetched above, in parallel) → funnel, observations,
    //    per-participant progress.
    const funnel = deriveFunnel(tutorialEvents, stepOrder);
    const observations = deriveObservations(tutorialEvents);
    const checks = deriveChecks(tutorialEvents);
    const checkStats = deriveCheckStats(tutorialEvents, stepOrder);
    const progressByWs = deriveProgressByWorkspace(tutorialEvents, stepOrder);

    // 4. Assemble per-participant rows.
    const participants: ParticipantAnalyticsRow[] = wsRows.map((w) => {
        const progress = progressByWs[w.id];
        const lastRun = lastRunByWs.get(w.id);
        return {
            workspaceId: w.id,
            userIdShort: w.userId.slice(0, 8),
            prolificPid: w.prolific?.prolificPid ?? null,
            studyId: w.prolific?.studyId ?? null,
            sessionId: w.prolific?.sessionId ?? null,
            charts: chartCountByWs.get(w.id) ?? 0,
            lensRuns: runCountByWs.get(w.id) ?? 0,
            modelsUsed: [...(modelsByWs.get(w.id) ?? [])].sort(),
            // Latest run, else last workspace touch — "did anything, and when".
            lastActiveAt: lastRun ?? w.updatedAt,
            furthestStepId: progress?.furthestStepId ?? null,
            hintsUsed: progress?.hintsUsed ?? 0,
        };
    });

    const activeParticipants = participants.filter((p) => p.lensRuns > 0).length;

    return {
        totals: {
            participants: wsRows.length,
            activeParticipants,
            lensRuns: runRows.length,
            charts: [...chartCountByWs.values()].reduce((a, b) => a + b, 0),
            documents: documentsTotal,
            prolificAttributed: wsRows.filter((w) => w.prolific?.prolificPid).length,
        },
        series: {
            joinsPerDay: bucketByDay(wsRows.map((w) => w.createdAt)),
            runsPerDay: bucketByDay(runRows.map((r) => r.createdAt)),
        },
        participants,
        tutorial: {
            funnel,
            observations,
            checks,
            checkStats,
            stepLabels: stepLabels ?? {},
            firstStepId: stepOrder && stepOrder.length > 0 ? stepOrder[0] : null,
            finalStepId: stepOrder && stepOrder.length > 0 ? stepOrder[stepOrder.length - 1] : null,
        },
    };
};

// tutorialCompletionPct lives in @/lib/workshopCompletion (a DB-free module) so
// the client stat tile can import it without bundling the Node DB client.

// ---- CSV export (the CHI analysis input) ----

/**
 * Escape a CSV cell: quote if it contains comma/quote/newline; double inner
 * quotes. Also neutralize spreadsheet formula injection — a cell that starts
 * with `=`, `+`, `-`, `@`, tab, or CR is executed as a formula by Excel/Sheets,
 * and observation/answer text is free text a participant typed. Prefix such
 * cells with a single quote so they render as literal text.
 */
const csvCell = (value: string | number | null): string => {
    let s = value == null ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    // Quote on any record/field separator — a lone \r (not just \n) is treated as
    // a row terminator by Excel/pandas and would split the row if left unquoted.
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const csvRow = (cells: (string | number | null)[]): string => cells.map(csvCell).join(",");

/**
 * Multi-section CSV: one row per participant, then one per observation, then one
 * per embedded-check answer. A `record_type` discriminator keeps all three in a
 * single downloadable file (the analysis splits on it). Prolific study/session
 * ids ride the participant rows so checks/observations join to survey responses
 * on the participant's PID. Pure over the analytics object so it's testable.
 */
export const buildWorkshopCsv = (analytics: WorkshopAnalytics): string => {
    const lines: string[] = [];
    lines.push(
        csvRow([
            "record_type",
            "workspace_id",
            "user_id_short",
            "prolific_pid",
            "study_id",
            "session_id",
            "charts",
            "lens_runs",
            "models_used",
            "last_active_at",
            "furthest_step",
            "hints_used",
            "step_id",
            "answer",
            "correct",
            "observation_text",
        ]),
    );
    for (const p of analytics.participants) {
        lines.push(
            csvRow([
                "participant",
                p.workspaceId,
                p.userIdShort,
                p.prolificPid,
                p.studyId,
                p.sessionId,
                p.charts,
                p.lensRuns,
                p.modelsUsed.join(" "),
                p.lastActiveAt.toISOString(),
                p.furthestStepId,
                p.hintsUsed,
                "",
                "",
                "",
                "",
            ]),
        );
    }
    for (const o of analytics.tutorial.observations) {
        lines.push(
            csvRow([
                "observation",
                o.workspaceId,
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                o.createdAt.toISOString(),
                "",
                "",
                o.stepId,
                "",
                "",
                o.text,
            ]),
        );
    }
    for (const c of analytics.tutorial.checks) {
        lines.push(
            csvRow([
                "check",
                c.workspaceId,
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                c.createdAt.toISOString(),
                "",
                "",
                c.stepId,
                c.answer,
                c.correct ? "1" : "0",
                "",
            ]),
        );
    }
    return lines.join("\n");
};
