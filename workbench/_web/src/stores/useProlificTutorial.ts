import { create } from "zustand";
import { persist } from "zustand/middleware";

import { recordTutorialEvent } from "@/lib/queries/tutorialEventsQueries";
import type { TutorialEventType, TutorialEventPayload } from "@/types/tutorialEvents";
import type { TutorialUnit } from "@/types/tutorial-content";
import { evalSuccessPredicate } from "@/types/tutorial-content";

/**
 * Coordinates the companion TutorialActivityPanel across the patch-lens tool.
 * localStorage is resume UX only — the DB (tutorial_events) is the source of
 * truth the analytics dashboard reads. Every meaningful action mirrors to a
 * tutorial_events row via recordTutorialEvent (app DB only; text never reaches
 * PostHog).
 *
 * Tutorial *content* is no longer hard-coded: `units` is injected from the DB
 * (resolveTutorialForWorkspace) via `setUnits`. Progression is data-driven —
 * the store evaluates each unit's `progression` descriptor instead of switching
 * on a specific unit id.
 *
 * Bucketed by workspaceId: a Prolific participant has one workspace, so on a
 * workspace change we reset rather than nest a per-workspace map.
 */

const HINT_AUTO_OFFER_AT = 2; // failed attempts before a hint is auto-offered

interface PanelPos {
    x: number;
    y: number;
}

interface ProlificTutorialState {
    workspaceId: string | null;
    // Content, injected from the DB. Not persisted — it comes from the query.
    units: TutorialUnit[];
    active: boolean;
    unitIdx: number;
    attemptsByUnit: Record<number, number>;
    hintStageByUnit: Record<number, number>;
    completedUnits: number[];
    checkAnsweredByUnit: Record<number, boolean>;
    observationByUnit: Record<number, boolean>;
    // Floating-overlay UI state (persisted): last drag position + collapsed.
    panelPos: PanelPos | null;
    collapsed: boolean;

    setUnits: (units: TutorialUnit[]) => void;
    setWorkspace: (workspaceId: string) => void;
    start: () => void;
    stop: () => void;
    goToUnit: (idx: number) => void;
    next: () => void;
    prev: () => void;
    /** Feed a completed run's top predicted token; evaluates the unit's success. */
    recordRun: (topToken: string | null) => void;
    /** A patch was applied (patch-unit progression). */
    markPatchApplied: () => void;
    /** Reveal the next hint rung; returns the new highest stage. */
    revealHint: () => number;
    answerCheck: (answer: string, correct: boolean) => void;
    submitObservation: (text: string) => void;
    setPanelPos: (pos: PanelPos) => void;
    setCollapsed: (collapsed: boolean) => void;
    reset: () => void;
}

// Fire-and-forget telemetry; never blocks the participant. Sync-returning (the
// store actions that call it aren't async) with the await handled in an inner
// task so a failed write can't surface as an unhandled rejection.
const emit = (
    workspaceId: string | null,
    stepId: string,
    eventType: TutorialEventType,
    payload?: TutorialEventPayload,
) => {
    if (!workspaceId) return;
    void (async () => {
        try {
            await recordTutorialEvent({ workspaceId, stepId, eventType, payload });
        } catch {
            /* telemetry is best-effort — never block or throw at the participant */
        }
    })();
};

const completeUnit = (
    state: ProlificTutorialState,
    idx: number,
): Partial<ProlificTutorialState> => {
    if (state.completedUnits.includes(idx)) return {};
    emit(state.workspaceId, stepIdForUnit(state, idx), "step_completed");
    return { completedUnits: [...state.completedUnits, idx] };
};

const stepIdForUnit = (state: ProlificTutorialState, idx: number): string =>
    state.units[idx]?.id ?? `unit-${idx}`;

export const useProlificTutorial = create<ProlificTutorialState>()(
    persist(
        (set, get) => ({
            workspaceId: null,
            units: [],
            active: false,
            unitIdx: 0,
            attemptsByUnit: {},
            hintStageByUnit: {},
            completedUnits: [],
            checkAnsweredByUnit: {},
            observationByUnit: {},
            panelPos: null,
            collapsed: false,

            setUnits: (units) =>
                set((s) => ({
                    units,
                    // Content is DB-driven and can change (admin edit / shorter
                    // tutorial) between a participant's visits. Clamp the persisted
                    // index so `units[unitIdx]` can never be undefined — otherwise
                    // the panel's `!unit` guard hides the whole tutorial and the
                    // participant can't advance or reach the survey handoff.
                    unitIdx: Math.min(s.unitIdx, Math.max(0, units.length - 1)),
                })),

            setWorkspace: (workspaceId) => {
                const prev = get().workspaceId;
                if (prev === workspaceId) return;
                // New workspace → fresh tutorial state (clean up impossible cross-
                // workspace bleed on rehydrate/navigation). Panel position/collapse
                // persist across workspaces (UI preference, not progress).
                set({
                    workspaceId,
                    active: false,
                    unitIdx: 0,
                    attemptsByUnit: {},
                    hintStageByUnit: {},
                    completedUnits: [],
                    checkAnsweredByUnit: {},
                    observationByUnit: {},
                });
            },

            start: () => {
                set({ active: true, unitIdx: 0, collapsed: false });
                emit(get().workspaceId, stepIdForUnit(get(), 0), "step_started");
            },

            stop: () => set({ active: false }),

            goToUnit: (idx) => {
                const total = get().units.length;
                if (idx < 0 || idx >= total) return;
                set({ unitIdx: idx });
                emit(get().workspaceId, stepIdForUnit(get(), idx), "step_started");
            },

            next: () => {
                const { unitIdx, units } = get();
                const nextIdx = Math.min(unitIdx + 1, units.length - 1);
                if (nextIdx === unitIdx) return;
                set({ unitIdx: nextIdx });
                emit(get().workspaceId, stepIdForUnit(get(), nextIdx), "step_started");
            },

            prev: () => {
                const { unitIdx } = get();
                set({ unitIdx: Math.max(unitIdx - 1, 0) });
            },

            recordRun: (topToken) => {
                const state = get();
                const idx = state.unitIdx;
                const unit = state.units[idx];
                if (!unit) return;

                // Only run-gated units progress on a completed run; patch/explore/
                // challenge units treat a lens run as a prerequisite, not completion.
                if (unit.progression.on !== "run") return;

                const success = evalSuccessPredicate(unit.progression.successPredicate, topToken);
                if (success) {
                    set(completeUnit(state, idx));
                    return;
                }
                // A failing run counts as a hint "attempt" only when the unit has a
                // real predicate (e.g. "make 5+5 ≠ 10"); an `always` unit that
                // didn't complete shouldn't happen, but never auto-offer hints there.
                const pred = unit.progression.successPredicate;
                if (!pred || pred.kind === "always") return;
                const attempts = (state.attemptsByUnit[idx] ?? 0) + 1;
                set({ attemptsByUnit: { ...state.attemptsByUnit, [idx]: attempts } });
            },

            markPatchApplied: () => {
                const state = get();
                const unit = state.units[state.unitIdx];
                if (unit?.progression.on !== "patch") return;
                set(completeUnit(state, state.unitIdx));
            },

            revealHint: () => {
                const state = get();
                const idx = state.unitIdx;
                const unit = state.units[idx];
                // `hintStageByUnit` is a threshold compared against each rung's
                // free-form `stage`, so advance to the next actual stage value —
                // not current+1 — or non-contiguous stages (e.g. [1,2,4]) strand
                // the last rung when the count cap (hints.length) never reaches it.
                const stages = [...new Set((unit?.hints ?? []).map((h) => h.stage))].sort(
                    (a, b) => a - b,
                );
                const current = state.hintStageByUnit[idx] ?? 0;
                const nextStage = stages.find((s) => s > current) ?? current;
                if (nextStage === current) return current;
                set({ hintStageByUnit: { ...state.hintStageByUnit, [idx]: nextStage } });
                emit(state.workspaceId, stepIdForUnit(state, idx), "hint_shown", {
                    hintStage: nextStage,
                    // The failed-attempt count that triggered this hint (0 for
                    // units without a run predicate) — the engagement covariate.
                    attempt: state.attemptsByUnit[idx] ?? 0,
                });
                return nextStage;
            },

            answerCheck: (answer, correct) => {
                const state = get();
                const idx = state.unitIdx;
                set({ checkAnsweredByUnit: { ...state.checkAnsweredByUnit, [idx]: true } });
                emit(state.workspaceId, stepIdForUnit(state, idx), "check_answered", {
                    answer,
                    correct,
                });
            },

            submitObservation: (text) => {
                const state = get();
                const idx = state.unitIdx;
                set({ observationByUnit: { ...state.observationByUnit, [idx]: true } });
                emit(state.workspaceId, stepIdForUnit(state, idx), "observation_submitted", {
                    observationText: text,
                });
                // Manual units (explore, final challenge) never complete on a run
                // or patch — submitting the observation is how they finish. Emit
                // step_completed so the completion funnel counts them (the finish
                // CTA already gates on this observation).
                const unit = state.units[idx];
                if (unit?.progression.on === "manual") {
                    set(completeUnit(get(), idx));
                }
            },

            setPanelPos: (pos) => set({ panelPos: pos }),
            setCollapsed: (collapsed) => set({ collapsed }),

            reset: () =>
                set({
                    active: false,
                    unitIdx: 0,
                    attemptsByUnit: {},
                    hintStageByUnit: {},
                    completedUnits: [],
                    checkAnsweredByUnit: {},
                    observationByUnit: {},
                }),
        }),
        {
            name: "workbench:prolific-tutorial",
            // Persist progress + panel UI preference; never persist `units` (they
            // come from the DB query on load).
            partialize: (s) => ({
                workspaceId: s.workspaceId,
                active: s.active,
                unitIdx: s.unitIdx,
                attemptsByUnit: s.attemptsByUnit,
                hintStageByUnit: s.hintStageByUnit,
                completedUnits: s.completedUnits,
                checkAnsweredByUnit: s.checkAnsweredByUnit,
                observationByUnit: s.observationByUnit,
                panelPos: s.panelPos,
                collapsed: s.collapsed,
            }),
            // A panel dragged off-screen in a larger window (or a different
            // monitor) would otherwise be unreachable — the panel clamps the
            // persisted position into the viewport at render time (mutating the
            // rehydrated state here wouldn't notify listeners or re-persist).
        },
    ),
);

export { HINT_AUTO_OFFER_AT };
