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

// Fire-and-forget telemetry; never blocks the participant.
const emit = (
    workspaceId: string | null,
    stepId: string,
    eventType: TutorialEventType,
    payload?: TutorialEventPayload,
) => {
    if (!workspaceId) return;
    void recordTutorialEvent({ workspaceId, stepId, eventType, payload }).catch(() => {});
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

            setUnits: (units) => set({ units }),

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
                const maxStage = unit?.hints.length ?? 0;
                const current = state.hintStageByUnit[idx] ?? 0;
                const nextStage = Math.min(current + 1, maxStage);
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
            // Clean up impossible states: a panel dragged off-screen in a larger
            // window (or a different monitor) would otherwise be unreachable.
            onRehydrateStorage: () => (state) => {
                if (!state?.panelPos || typeof window === "undefined") return;
                const maxX = Math.max(0, window.innerWidth - 320);
                const maxY = Math.max(0, window.innerHeight - 120);
                state.panelPos = {
                    x: Math.min(Math.max(0, state.panelPos.x), maxX),
                    y: Math.min(Math.max(0, state.panelPos.y), maxY),
                };
            },
        },
    ),
);

export { HINT_AUTO_OFFER_AT };
