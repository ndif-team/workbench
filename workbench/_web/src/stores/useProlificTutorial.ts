import { create } from "zustand";
import { persist } from "zustand/middleware";

import { recordTutorialEvent } from "@/lib/queries/tutorialEventsQueries";
import type { TutorialEventType, TutorialEventPayload } from "@/types/tutorialEvents";
import type { TutorialUnit, UnitCheck } from "@/types/tutorial-content";
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

/**
 * A unit's frozen embedded-check answer key: the tokens from the last lens run
 * *initiated from that unit*. Frozen per unit rather than read from the latest
 * run anywhere, so a run started on another unit can never become the answer key
 * for this one — the participant who goes back to fill in a check they skipped is
 * scored against their own run of this unit's prompt.
 */
interface RunTokens {
    topToken: string;
    secondToken: string | null;
    /**
     * The `lens_runs` row this key was read off, when the history write succeeded.
     *
     * Keys used to be dropped on reload so an answer could never be scored against
     * a result no longer on screen. But the run *is* restored now — the chart row
     * points at it with `activeLensRunId` and the display refetches its heatmaps —
     * so a participant who reloaded mid-step was left with the answer visible, the
     * step marked complete, and the check still insisting they hadn't run anything.
     * The run id is what makes the weaker rule safe: a persisted key survives only
     * while it names the run currently on screen (see `pruneRunKeys`). A key with
     * no run id can't be checked that way, so it is never persisted.
     */
    runId: string | null;
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
    /**
     * What the participant answered on each unit's embedded check, and whether it
     * was right. Additive alongside `checkAnsweredByUnit` rather than replacing it:
     * that field is a persisted boolean, and widening it in place would make every
     * already-stored `true` read as a malformed result object.
     *
     * Exists so a revisited step can say what they answered instead of only that
     * they did — the check locks after one answer, so without this the participant
     * who comes back to re-read the question is told "already answered" and nothing
     * more.
     */
    checkResultByUnit: Record<number, { answer: string; correct: boolean }>;
    observationByUnit: Record<number, boolean>;
    // Frozen answer keys, per unit (see RunTokens). Persisted, but only the entries
    // naming the run they came from, and only for as long as that run is the one on
    // screen — so a key still can't outlive the result it describes.
    runTokensByUnit: Record<number, RunTokens>;
    // The TARGET's post-patch top predicted token, per unit it was applied on —
    // so a patch unit's embedded check scores against the actual patch outcome
    // (not the source's pre-patch prediction). Ephemeral, same reasoning.
    patchTokenByUnit: Record<number, string>;
    // Floating-overlay UI state (persisted): last drag position + collapsed.
    panelPos: PanelPos | null;
    collapsed: boolean;
    /**
     * Whether the modal orientation slideshow is on screen. Ephemeral — a refresh
     * mid-slideshow drops the participant into the step itself rather than
     * re-opening a dialog over work they have already started.
     */
    welcomeOpen: boolean;
    /**
     * Whether this participant has been through the orientation. Persisted (and
     * reset per workspace) so `start()` only auto-opens it the first time; the
     * Tutorial menu can always reopen it deliberately.
     */
    welcomeSeen: boolean;

    setUnits: (units: TutorialUnit[]) => void;
    setWorkspace: (workspaceId: string) => void;
    start: () => void;
    stop: () => void;
    goToUnit: (idx: number) => void;
    next: () => void;
    prev: () => void;
    /** Feed a completed run's top two predicted tokens; freezes that unit's check
     * answer key and evaluates the unit's success. `unitIdx` pins both to the unit
     * the run was *initiated* from, so a slow run that resolves after the
     * participant advances can't complete — or re-key — the wrong (now-current)
     * unit. Falls back to the current unit when omitted. */
    recordRun: (
        tokens: { top: string | null; second: string | null; runId?: string | null },
        unitIdx?: number,
    ) => void;
    /**
     * Validate rehydrated answer keys against the run actually on screen, dropping
     * any that name a different one. Called once per mount, when the chart row has
     * loaded — not on every change, so a key frozen by a run that finished after
     * that read can't be pruned by a stale `activeLensRunId`.
     */
    pruneRunKeys: (activeRunId: string | null) => void;
    /** A patch was applied (patch-unit progression). `unitIdx` pins completion to
     * the unit the patch was *initiated* from, so an async intervention that
     * settles after the participant advances can't complete the wrong unit.
     * Falls back to the current unit when omitted. */
    markPatchApplied: (unitIdx?: number) => void;
    /** Feed the TARGET's post-patch top token (from the widget) so a patch unit's
     * embedded check can score against the actual patch outcome — and so the panel
     * can state that outcome in words. `unitIdx` pins the result to the unit the
     * intervention was initiated from (see `markPatchApplied`); falls back to the
     * current unit when omitted. */
    recordPatchResult: (topToken: string | null, unitIdx?: number) => void;
    /** The patch was undone, so its outcome no longer describes the screen: drop
     * the recorded result rather than let the panel keep announcing it. */
    clearPatchResult: (unitIdx?: number) => void;
    /**
     * The participant has arrived at `idx`. Completes it when it is the last unit
     * and finishes manually — reaching the end of the activity IS finishing it, so
     * the finish CTA no longer waits on a saved note.
     *
     * Without this, ungating the CTA would mean a participant sees "you're done"
     * and leaves having emitted no `step_completed` for the final step — and row
     * completion is verified from that telemetry post-hoc (see CompletionCta).
     * Idempotent via `completedUnits`, which is persisted, so a reload on the last
     * step re-runs this without emitting a second event.
     */
    markReached: (idx: number) => void;
    /** Reveal the next hint rung; returns the new highest stage. */
    revealHint: () => number;
    /**
     * File the participant's answer to this step's check.
     *
     * `grading` is required rather than optional: the answer key is what makes
     * the logged verdict re-checkable, and it is only in scope at the call site
     * (a run-scored key comes from this unit's own run). An optional argument
     * would let a future caller drop it and leave a `check_answered` row nobody
     * can re-grade.
     */
    answerCheck: (
        answer: string,
        correct: boolean,
        grading: { expected: string | null; checkKind: UnitCheck["kind"] },
    ) => void;
    submitObservation: (text: string) => void;
    setPanelPos: (pos: PanelPos) => void;
    setCollapsed: (collapsed: boolean) => void;
    /** Open the orientation slideshow (Tutorial menu, or automatically on first
     * `start()`). Marks it seen immediately, so a mid-slideshow reload doesn't
     * re-open it. */
    openWelcome: () => void;
    /** Dismiss the slideshow. It stays marked seen either way — skipping is a
     * decision, not an interruption. */
    closeWelcome: () => void;
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
            checkResultByUnit: {},
            observationByUnit: {},
            runTokensByUnit: {},
            patchTokenByUnit: {},
            panelPos: null,
            collapsed: false,
            welcomeOpen: false,
            welcomeSeen: false,

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
                    checkResultByUnit: {},
                    observationByUnit: {},
                    runTokensByUnit: {},
                    patchTokenByUnit: {},
                    // A different participant, so a fresh orientation.
                    welcomeOpen: false,
                    welcomeSeen: false,
                });
            },

            start: () => {
                // First start opens the orientation slideshow over the tool; a
                // resume (or a deliberate restart) goes straight to the step.
                const firstTime = !get().welcomeSeen;
                set({
                    active: true,
                    unitIdx: 0,
                    collapsed: false,
                    welcomeOpen: firstTime,
                    welcomeSeen: true,
                });
                emit(get().workspaceId, stepIdForUnit(get(), 0), "step_started");
            },

            stop: () => set({ active: false, welcomeOpen: false }),

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
                const prevIdx = Math.max(unitIdx - 1, 0);
                if (prevIdx === unitIdx) return;
                set({ unitIdx: prevIdx });
                // Walking back is a step entry too. Without this, a participant who
                // goes back to answer a check they skipped produces a check_answered
                // with no preceding step_started, and their route through the tutorial
                // has to be reconstructed by hand. `step_started` therefore means
                // "entered this step", not "entered it for the first time"; the funnel
                // is max-based, so nothing downstream changes.
                emit(get().workspaceId, stepIdForUnit(get(), prevIdx), "step_started");
            },

            recordRun: (tokens, unitIdx) => {
                const state = get();
                // Score the unit the run was initiated from, not whatever unit is
                // current when the async lens run resolves — otherwise advancing
                // mid-run completes the wrong (next) unit.
                const idx = unitIdx ?? state.unitIdx;
                const unit = state.units[idx];
                if (!unit) return;

                const topToken = tokens.top;
                // Freeze this unit's check answer key against its own run, before
                // the progression branch below: a patch or explore unit can carry a
                // run-scored check too, and its run is still the key. Updater form
                // throughout — this action writes more than once, and a second write
                // built from the pre-first-write snapshot would revert the first.
                if (topToken != null) {
                    set((s) => ({
                        runTokensByUnit: {
                            ...s.runTokensByUnit,
                            [idx]: {
                                topToken,
                                secondToken: tokens.second,
                                runId: tokens.runId ?? null,
                            },
                        },
                    }));
                }

                // Only run-gated units progress on a completed run; patch/explore/
                // challenge units treat a lens run as a prerequisite, not completion.
                if (unit.progression.on !== "run") return;

                const success = evalSuccessPredicate(unit.progression.successPredicate, topToken);
                if (success) {
                    set((s) => completeUnit(s, idx));
                    return;
                }
                // A failing run counts as a hint "attempt" only when the unit has a
                // real predicate (e.g. "make 5+5 ≠ 10"); an `always` unit that
                // didn't complete shouldn't happen, but never auto-offer hints there.
                const pred = unit.progression.successPredicate;
                if (!pred || pred.kind === "always") return;
                set((s) => ({
                    attemptsByUnit: {
                        ...s.attemptsByUnit,
                        [idx]: (s.attemptsByUnit[idx] ?? 0) + 1,
                    },
                }));
            },

            markPatchApplied: (unitIdx) => {
                const state = get();
                const idx = unitIdx ?? state.unitIdx;
                const unit = state.units[idx];
                if (unit?.progression.on !== "patch") return;
                set(completeUnit(state, idx));
            },

            recordPatchResult: (topToken, unitIdx) => {
                const state = get();
                // Only relevant while the guided tutorial is running; pin to the
                // unit the intervention was initiated from so the check requires a
                // patch on THAT unit (mid-run navigation can't misattribute it).
                if (!state.active) return;
                const idx = unitIdx ?? state.unitIdx;
                // Only a patch unit has a patch check to key. Without this, a patch
                // restored from a previous session — reported by the widget before the
                // participant has navigated anywhere — files itself under whatever
                // step they happen to be on.
                if (state.units[idx]?.progression.on !== "patch") return;
                // The widget reports the result on every render pass that has one;
                // only write a real token, and only on a change (an unreadable
                // result leaves the check gated on applying the patch).
                if (topToken == null || state.patchTokenByUnit[idx] === topToken) return;
                set({ patchTokenByUnit: { ...state.patchTokenByUnit, [idx]: topToken } });
            },

            clearPatchResult: (unitIdx) => {
                const state = get();
                const idx = unitIdx ?? state.unitIdx;
                if (state.patchTokenByUnit[idx] === undefined) return;
                const next = { ...state.patchTokenByUnit };
                delete next[idx];
                set({ patchTokenByUnit: next });
            },

            pruneRunKeys: (activeRunId) => {
                const current = get().runTokensByUnit;
                const kept: Record<number, RunTokens> = {};
                for (const [key, tokens] of Object.entries(current)) {
                    // A key with no run id can only have come from a run in this
                    // session — `partialize` refuses to store those — so it is
                    // trusted: its result is the one on screen. Anything else has to
                    // name the run the chart is currently showing.
                    if (tokens.runId == null || tokens.runId === activeRunId) {
                        kept[Number(key)] = tokens;
                    }
                }
                if (Object.keys(kept).length === Object.keys(current).length) return;
                set({ runTokensByUnit: kept });
            },

            markReached: (idx) => {
                const state = get();
                const total = state.units.length;
                if (total === 0 || idx !== total - 1) return;
                // Only a *manual* final unit. A run- or patch-gated last step still
                // has an action the participant can perform, and auto-completing it
                // would file a step_completed for work nobody did.
                if (state.units[idx]?.progression.on !== "manual") return;
                set(completeUnit(state, idx));
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

            answerCheck: (answer, correct, grading) => {
                const state = get();
                const idx = state.unitIdx;
                // One check_answered per step, enforced here as well as by the input's
                // locked state: this row is the engagement measure, and a second one
                // for the same step would double-count it.
                if (state.checkAnsweredByUnit[idx]) return;
                set({
                    checkAnsweredByUnit: { ...state.checkAnsweredByUnit, [idx]: true },
                    checkResultByUnit: {
                        ...state.checkResultByUnit,
                        [idx]: { answer, correct },
                    },
                });
                emit(state.workspaceId, stepIdForUnit(state, idx), "check_answered", {
                    answer,
                    correct,
                    // Null key means the check was answerable without one (it
                    // cannot be, today — `resolveCheckKey` closes the check when
                    // it has no key), so omit the field rather than logging a
                    // literal "null" that reads like an answer.
                    ...(grading.expected != null ? { expected: grading.expected } : {}),
                    checkKind: grading.checkKind,
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

            // Reopening the orientation shouldn't hide the panel behind it, so
            // uncollapse as well — otherwise "start the tour" points at a column
            // that isn't there.
            openWelcome: () => set({ welcomeOpen: true, welcomeSeen: true, collapsed: false }),
            closeWelcome: () => set({ welcomeOpen: false, welcomeSeen: true }),

            reset: () =>
                set({
                    active: false,
                    unitIdx: 0,
                    attemptsByUnit: {},
                    hintStageByUnit: {},
                    completedUnits: [],
                    checkAnsweredByUnit: {},
                    checkResultByUnit: {},
                    observationByUnit: {},
                    runTokensByUnit: {},
                    patchTokenByUnit: {},
                    welcomeOpen: false,
                    welcomeSeen: false,
                }),
        }),
        {
            name: "workbench:prolific-tutorial",
            // Persist progress + panel UI preference; never persist `units` (they
            // come from the DB query on load).
            //
            // `runTokensByUnit` is persisted, but only the entries that name the
            // `lens_runs` row they were read off: those can be validated against the
            // run on screen at load (`pruneRunKeys`), which is what keeps "never
            // score an answer against a result that isn't there" true across a
            // reload. `patchTokenByUnit` stays out entirely — the widget re-reports a
            // restored patch's outcome on mount, so that key rebuilds itself.
            partialize: (s) => ({
                workspaceId: s.workspaceId,
                active: s.active,
                unitIdx: s.unitIdx,
                attemptsByUnit: s.attemptsByUnit,
                hintStageByUnit: s.hintStageByUnit,
                completedUnits: s.completedUnits,
                checkAnsweredByUnit: s.checkAnsweredByUnit,
                checkResultByUnit: s.checkResultByUnit,
                observationByUnit: s.observationByUnit,
                runTokensByUnit: Object.fromEntries(
                    Object.entries(s.runTokensByUnit).filter(([, k]) => k.runId != null),
                ) as Record<number, RunTokens>,
                panelPos: s.panelPos,
                collapsed: s.collapsed,
                // `welcomeOpen` is deliberately absent: a reload mid-slideshow
                // resumes the step, not the dialog over it.
                welcomeSeen: s.welcomeSeen,
            }),
            // A panel dragged off-screen in a larger window (or a different
            // monitor) would otherwise be unreachable — the panel clamps the
            // persisted position into the viewport at render time (mutating the
            // rehydrated state here wouldn't notify listeners or re-persist).
        },
    ),
);

export { HINT_AUTO_OFFER_AT };
