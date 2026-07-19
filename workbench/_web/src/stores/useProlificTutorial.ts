import { create } from "zustand";
import { persist } from "zustand/middleware";

import { TUTORIAL_UNITS } from "@/tutorials/prolificUnits";
import { unit3SuccessPredicate } from "@/tutorials/prolificUnits";
import { TUTORIAL_STEP_IDS } from "@/tutorials/prolificSteps";
import { recordTutorialEvent } from "@/lib/queries/tutorialEventsQueries";
import type { TutorialEventType, TutorialEventPayload } from "@/types/tutorialEvents";

/**
 * Coordinates the companion TutorialActivityPanel across the patch-lens tool.
 * localStorage is resume UX only — the DB (tutorial_events) is the source of
 * truth the analytics dashboard reads (spec §5). Every meaningful action mirrors
 * to a tutorial_events row via recordTutorialEvent (app DB only; text never
 * reaches PostHog).
 *
 * Bucketed by workspaceId: a Prolific participant has one workspace, so on a
 * workspace change we reset rather than nest a per-workspace map.
 */

const HINT_AUTO_OFFER_AT = 2; // failed attempts before a hint is auto-offered (§4.3)

interface ProlificTutorialState {
    workspaceId: string | null;
    active: boolean;
    unitIdx: number;
    attemptsByUnit: Record<number, number>;
    hintStageByUnit: Record<number, number>;
    completedUnits: number[];
    checkAnsweredByUnit: Record<number, boolean>;
    observationByUnit: Record<number, boolean>;

    setWorkspace: (workspaceId: string) => void;
    start: () => void;
    stop: () => void;
    goToUnit: (idx: number) => void;
    next: () => void;
    prev: () => void;
    /** Feed a completed run's top predicted token; evaluates the unit's success. */
    recordRun: (topToken: string | null) => void;
    /** A patch was applied (unit 4 progression). */
    markPatchApplied: () => void;
    /** Reveal the next hint rung; returns the new highest stage. */
    revealHint: () => number;
    answerCheck: (answer: string, correct: boolean) => void;
    submitObservation: (text: string) => void;
    reset: () => void;
}

const stepIdForUnit = (idx: number): string => TUTORIAL_UNITS[idx]?.id ?? `unit-${idx}`;

// Fire-and-forget telemetry; never blocks the participant.
const emit = (
    workspaceId: string | null,
    idx: number,
    eventType: TutorialEventType,
    payload?: TutorialEventPayload,
) => {
    if (!workspaceId) return;
    void recordTutorialEvent({ workspaceId, stepId: stepIdForUnit(idx), eventType, payload }).catch(
        () => {},
    );
};

const completeUnit = (
    state: ProlificTutorialState,
    idx: number,
): Partial<ProlificTutorialState> => {
    if (state.completedUnits.includes(idx)) return {};
    emit(state.workspaceId, idx, "step_completed");
    return { completedUnits: [...state.completedUnits, idx] };
};

export const useProlificTutorial = create<ProlificTutorialState>()(
    persist(
        (set, get) => ({
            workspaceId: null,
            active: false,
            unitIdx: 0,
            attemptsByUnit: {},
            hintStageByUnit: {},
            completedUnits: [],
            checkAnsweredByUnit: {},
            observationByUnit: {},

            setWorkspace: (workspaceId) => {
                const prev = get().workspaceId;
                if (prev === workspaceId) return;
                // New workspace → fresh tutorial state (clean up impossible cross-
                // workspace bleed on rehydrate/navigation).
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
                set({ active: true, unitIdx: 0 });
                emit(get().workspaceId, 0, "step_started");
            },

            stop: () => set({ active: false }),

            goToUnit: (idx) => {
                if (idx < 0 || idx >= TUTORIAL_UNITS.length) return;
                set({ unitIdx: idx });
                emit(get().workspaceId, idx, "step_started");
            },

            next: () => {
                const { unitIdx } = get();
                const nextIdx = Math.min(unitIdx + 1, TUTORIAL_UNITS.length - 1);
                if (nextIdx === unitIdx) return;
                set({ unitIdx: nextIdx });
                emit(get().workspaceId, nextIdx, "step_started");
            },

            prev: () => {
                const { unitIdx } = get();
                set({ unitIdx: Math.max(unitIdx - 1, 0) });
            },

            recordRun: (topToken) => {
                const state = get();
                const idx = state.unitIdx;
                const unit = TUTORIAL_UNITS[idx];
                if (!unit) return;

                // Unit 3 has a real success predicate (make 5+5 ≠ 10); other lens
                // units succeed on any completed run. Patch/explore/challenge units
                // don't progress on a plain run.
                let success = false;
                if (unit.id === TUTORIAL_STEP_IDS.patternsBeatFacts) {
                    success = unit3SuccessPredicate(topToken);
                } else if (unit.kind === "lens") {
                    success = true;
                }

                if (success) {
                    set(completeUnit(state, idx));
                    return;
                }
                // Only unit 3 gates progression on the run's outcome, so only there
                // does a non-satisfying run count as a hint "attempt". A lens run in
                // a patch/explore/challenge unit is a prerequisite, not a failure —
                // counting it would wrongly auto-offer hints.
                if (unit.id !== TUTORIAL_STEP_IDS.patternsBeatFacts) return;
                const attempts = (state.attemptsByUnit[idx] ?? 0) + 1;
                set({ attemptsByUnit: { ...state.attemptsByUnit, [idx]: attempts } });
            },

            markPatchApplied: () => {
                const state = get();
                const unit = TUTORIAL_UNITS[state.unitIdx];
                if (unit?.kind !== "patch") return;
                set(completeUnit(state, state.unitIdx));
            },

            revealHint: () => {
                const state = get();
                const idx = state.unitIdx;
                const unit = TUTORIAL_UNITS[idx];
                const maxStage = unit?.hints.length ?? 0;
                const current = state.hintStageByUnit[idx] ?? 0;
                const nextStage = Math.min(current + 1, maxStage);
                if (nextStage === current) return current;
                set({ hintStageByUnit: { ...state.hintStageByUnit, [idx]: nextStage } });
                emit(state.workspaceId, idx, "hint_shown", { hintStage: nextStage });
                return nextStage;
            },

            answerCheck: (answer, correct) => {
                const state = get();
                const idx = state.unitIdx;
                set({ checkAnsweredByUnit: { ...state.checkAnsweredByUnit, [idx]: true } });
                emit(state.workspaceId, idx, "check_answered", { answer, correct });
            },

            submitObservation: (text) => {
                const state = get();
                const idx = state.unitIdx;
                set({ observationByUnit: { ...state.observationByUnit, [idx]: true } });
                emit(state.workspaceId, idx, "observation_submitted", { observationText: text });
            },

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
            // Persist progress but not the transient nothing — everything here is
            // resume state, so persist all of it.
            partialize: (s) => ({
                workspaceId: s.workspaceId,
                active: s.active,
                unitIdx: s.unitIdx,
                attemptsByUnit: s.attemptsByUnit,
                hintStageByUnit: s.hintStageByUnit,
                completedUnits: s.completedUnits,
                checkAnsweredByUnit: s.checkAnsweredByUnit,
                observationByUnit: s.observationByUnit,
            }),
        },
    ),
);

export { HINT_AUTO_OFFER_AT };
