import { db } from "@/db/client";
import { tutorialEvents, workspaces } from "@/db/schema";
import type { TutorialEvent } from "@/db/schema";
import type { TutorialEventPayload, TutorialEventType, TutorialNote } from "@/types/tutorialEvents";
import { asc, eq } from "drizzle-orm";

/**
 * Unguarded tutorial_events DB internals. The "use server" RPC surface splits
 * two ways: the participant write (recordTutorialEvent) lives in
 * tutorialEventsQueries.ts; the admin-guarded analytics reads compose the
 * aggregation helpers below from workshopAnalyticsQueries.ts. Keeping the
 * internals here makes them directly testable under bun:test (no Supabase
 * session) and mirrors the workshopDb / workshopQueries split.
 *
 * Aggregation (funnel, observations, per-participant progress) is derived in TS
 * from the raw rows rather than with dialect-specific GROUP BY — same reasoning
 * as the analytics day-bucketing. Per-workshop event volume is modest.
 */

export interface RecordTutorialEventInput {
    workspaceId: string;
    stepId: string;
    eventType: TutorialEventType;
    payload?: TutorialEventPayload;
}

export const insertTutorialEvent = async (
    input: RecordTutorialEventInput,
): Promise<TutorialEvent> => {
    const [row] = await db
        .insert(tutorialEvents)
        .values({
            workspaceId: input.workspaceId,
            stepId: input.stepId,
            eventType: input.eventType,
            payload: input.payload ?? null,
        })
        .returning();
    return row as TutorialEvent;
};

/** All events for one workspace, oldest → newest (the participant's own timeline). */
export const getTutorialEventsForWorkspace = async (
    workspaceId: string,
): Promise<TutorialEvent[]> => {
    const rows = await db
        .select()
        .from(tutorialEvents)
        .where(eq(tutorialEvents.workspaceId, workspaceId))
        .orderBy(asc(tutorialEvents.createdAt), asc(tutorialEvents.id));
    return rows as TutorialEvent[];
};

/**
 * Every tutorial event for a workshop's participants, joined through
 * workspaces.workshop_id. Ordered so the TS aggregators can rely on
 * chronological order. The analytics layer derives funnel/observations/progress
 * from this single fetch.
 */
export const getTutorialEventsForWorkshop = async (
    workshopId: string,
): Promise<TutorialEvent[]> => {
    const rows = await db
        .select({
            id: tutorialEvents.id,
            workspaceId: tutorialEvents.workspaceId,
            stepId: tutorialEvents.stepId,
            eventType: tutorialEvents.eventType,
            payload: tutorialEvents.payload,
            createdAt: tutorialEvents.createdAt,
        })
        .from(tutorialEvents)
        .innerJoin(workspaces, eq(tutorialEvents.workspaceId, workspaces.id))
        .where(eq(workspaces.workshopId, workshopId))
        .orderBy(asc(tutorialEvents.createdAt), asc(tutorialEvents.id));
    return rows as TutorialEvent[];
};

// ---- Pure TS aggregators (shared by analytics + unit-tested directly) ----

export interface StepFunnelRow {
    stepId: string;
    started: number;
    completed: number;
}

/**
 * Per-step started→completed counts, counting each workspace at most once per
 * step (a participant who reruns a step doesn't inflate the funnel). Ordered by
 * the supplied canonical step order when given; otherwise by first appearance.
 */
export const deriveFunnel = (
    events: TutorialEvent[],
    stepOrder?: readonly string[],
): StepFunnelRow[] => {
    const started = new Map<string, Set<string>>();
    const completed = new Map<string, Set<string>>();
    const seenOrder: string[] = [];

    for (const e of events) {
        if (e.eventType !== "step_started" && e.eventType !== "step_completed") continue;
        if (!started.has(e.stepId) && !completed.has(e.stepId)) seenOrder.push(e.stepId);
        const bucket = e.eventType === "step_started" ? started : completed;
        if (!bucket.has(e.stepId)) bucket.set(e.stepId, new Set());
        bucket.get(e.stepId)!.add(e.workspaceId);
    }

    const stepIds = stepOrder
        ? stepOrder.filter((s) => started.has(s) || completed.has(s))
        : seenOrder;

    return stepIds.map((stepId) => ({
        stepId,
        started: started.get(stepId)?.size ?? 0,
        completed: completed.get(stepId)?.size ?? 0,
    }));
};

export interface ObservationRow {
    workspaceId: string;
    stepId: string;
    text: string;
    createdAt: Date;
}

/** Flattened observation submissions (the free-text the participant wrote). */
export const deriveObservations = (events: TutorialEvent[]): ObservationRow[] =>
    events
        .filter((e) => e.eventType === "observation_submitted")
        .map((e) => ({
            workspaceId: e.workspaceId,
            stepId: e.stepId,
            text: e.payload?.observationText ?? "",
            createdAt: e.createdAt,
        }));

/**
 * One participant's own reflections, latest per step, for reading back to them.
 *
 * Policy: the table is append-only and a participant can legitimately write a
 * second note for the same step (they cleared localStorage, or came back in a
 * second browser — the submitted flag lives in the persisted store, the text
 * lives here), so the raw rows can hold several notes per step id. Every row
 * stays in the DB and the admin list above still shows all of them, because for
 * analysis a rewrite is data. The participant's own list shows only the latest
 * per step: to the person who wrote it a rewrite reads as a correction of the
 * same note, and showing both makes their list look duplicated.
 *
 * Ordering is the order they first wrote about each step — a `Map` keeps its
 * insertion position when a later row overwrites the value, so a correction
 * doesn't jump the note to the end of the list. (The caller re-sorts into unit
 * order; this order is what survives for steps the content no longer knows.)
 *
 * Keyed by `stepId`, which `stepIdForUnit` fills with the unit's stable id
 * string rather than its array index. That is why the DB is the right source
 * for this and the store is not: notes cannot silently re-attach to a different
 * step when the content is edited between sessions.
 */
export const deriveLatestNotes = (events: TutorialEvent[]): TutorialNote[] => {
    const latest = new Map<string, TutorialNote>();
    for (const e of events) {
        if (e.eventType !== "observation_submitted") continue;
        const text = (e.payload?.observationText ?? "").trim();
        // A blank or whitespace-only submission is nothing to re-read, and it
        // must not blank out a real earlier note for the same step.
        if (!text) continue;
        latest.set(e.stepId, { stepId: e.stepId, text, createdAt: e.createdAt });
    }
    return [...latest.values()];
};

export interface CheckAnswerRow {
    workspaceId: string;
    stepId: string;
    answer: string;
    correct: boolean;
    createdAt: Date;
}

/**
 * Flattened embedded-check answers (the participant's response + whether it
 * matched their own run). Joinable to survey responses on the workspace's
 * Prolific PID — the reason these are surfaced.
 */
export const deriveChecks = (events: TutorialEvent[]): CheckAnswerRow[] =>
    events
        .filter((e) => e.eventType === "check_answered")
        .map((e) => ({
            workspaceId: e.workspaceId,
            stepId: e.stepId,
            answer: e.payload?.answer ?? "",
            correct: !!e.payload?.correct,
            createdAt: e.createdAt,
        }));

export interface CheckStatRow {
    stepId: string;
    answered: number;
    correct: number;
}

/**
 * Per-step check pass counts, one answer per (workspace, step) — a participant
 * who re-answers doesn't inflate the totals (the panel already blocks re-answer,
 * but the aggregation is defensive). Ordered by the supplied canonical step
 * order when given, else by first appearance.
 */
export const deriveCheckStats = (
    events: TutorialEvent[],
    stepOrder?: readonly string[],
): CheckStatRow[] => {
    const answered = new Map<string, Set<string>>();
    const correct = new Map<string, Set<string>>();
    const seenOrder: string[] = [];

    for (const e of events) {
        if (e.eventType !== "check_answered") continue;
        if (!answered.has(e.stepId)) {
            answered.set(e.stepId, new Set());
            seenOrder.push(e.stepId);
        }
        answered.get(e.stepId)!.add(e.workspaceId);
        if (e.payload?.correct) {
            if (!correct.has(e.stepId)) correct.set(e.stepId, new Set());
            correct.get(e.stepId)!.add(e.workspaceId);
        }
    }

    const stepIds = stepOrder ? stepOrder.filter((s) => answered.has(s)) : seenOrder;
    return stepIds.map((stepId) => ({
        stepId,
        answered: answered.get(stepId)?.size ?? 0,
        correct: correct.get(stepId)?.size ?? 0,
    }));
};

export interface WorkspaceTutorialProgress {
    completedStepIds: string[];
    furthestStepId: string | null;
    hintsUsed: number;
}

/**
 * Per-workspace tutorial progress, keyed by workspaceId. `furthestStepId` is the
 * latest completed step by the supplied canonical order (falls back to the last
 * completed by time when no order is given). `hintsUsed` counts hint_shown
 * events — the engagement covariate.
 */
export const deriveProgressByWorkspace = (
    events: TutorialEvent[],
    stepOrder?: readonly string[],
): Record<string, WorkspaceTutorialProgress> => {
    const orderIndex = new Map<string, number>();
    stepOrder?.forEach((s, i) => orderIndex.set(s, i));

    const progress: Record<string, WorkspaceTutorialProgress> = {};
    for (const e of events) {
        const p = (progress[e.workspaceId] ??= {
            completedStepIds: [],
            furthestStepId: null,
            hintsUsed: 0,
        });
        if (e.eventType === "hint_shown") {
            p.hintsUsed += 1;
        } else if (e.eventType === "step_completed") {
            // Ignore anything outside the canonical order. The orientation
            // walkthrough writes its own `tour-`-prefixed step ids (see
            // orientationTour.ts) so its drop-off is measurable, but "furthest step
            // reached" and "steps completed" mean *tutorial units* — an unranked id
            // would otherwise become a participant's furthest step (rank -1 beats
            // the initial best of -1) and show a tour step in the participants
            // table for anyone who never finished a unit.
            if (stepOrder && !orderIndex.has(e.stepId)) continue;
            if (!p.completedStepIds.includes(e.stepId)) p.completedStepIds.push(e.stepId);
            if (stepOrder) {
                const rank = orderIndex.get(e.stepId) ?? -1;
                const bestRank = p.furthestStepId ? (orderIndex.get(p.furthestStepId) ?? -1) : -1;
                if (rank >= bestRank) p.furthestStepId = e.stepId;
            } else {
                // No canonical order: events arrive chronologically, so the last
                // step_completed seen is the furthest reached.
                p.furthestStepId = e.stepId;
            }
        }
    }
    return progress;
};
