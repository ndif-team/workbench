import { db } from "@/db/client";
import { tutorialEvents, workspaces } from "@/db/schema";
import type { TutorialEvent } from "@/db/schema";
import type { TutorialEventPayload, TutorialEventType } from "@/types/tutorialEvents";
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
