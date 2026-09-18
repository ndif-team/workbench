"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion, useDragControls } from "motion/react";
import {
    ChevronDown,
    ChevronRight,
    GripVertical,
    HelpCircle,
    Lightbulb,
    Minus,
    PanelRightClose,
    Pencil,
    RotateCcw,
    X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useCapture } from "@/lib/analytics";
import { useTutorialNotes } from "@/lib/api/tutorialEventsApi";
import { queryKeys } from "@/lib/queryKeys";
import { orderNotesByUnits } from "@/lib/tutorialNotes";
import { useProlificTutorial, HINT_AUTO_OFFER_AT } from "@/stores/useProlificTutorial";
import type {
    CheckFeedback,
    GlossaryEntry,
    HintRung,
    SpotlightTarget,
    UnitCheck,
} from "@/types/tutorial-content";
import {
    hasDoneUnitAction,
    normalizeAnswer,
    resolveCheckFeedback,
    resolveCheckKey,
    resolveUnitSpotlights,
} from "@/types/tutorial-content";
import type { TutorialNote } from "@/types/tutorialEvents";
import { DEFAULT_GLOSSARY } from "@/tutorials/glossary";
import { CompletionCta } from "./CompletionCta";
import { TutorialGlossary } from "./TutorialGlossary";
import { TutorialNotes } from "./TutorialNotes";
import { useTutorialDock } from "./TutorialDock";

/**
 * The companion "guided tutorial" activity surface. Each unit carries: a task, a
 * concept callout, a known-good prompt bank, a progressive hint ladder, an
 * auto-scored embedded check, and an observation box. Content comes from the DB
 * (store.units); every interaction mirrors to tutorial_events via the store (app
 * DB only).
 *
 * Two placements, chosen by whether a dock exists (see TutorialDock):
 *  - **docked** (desktop) — a column of the tool's resizable layout, so it never
 *    covers the prompt boxes or the heatmap it is talking about;
 *  - **floating** (mobile, or any host with no dock) — a draggable overlay
 *    portaled to <body>, positioned by the participant and remembered.
 *
 * Reactour still handles the spotlight explanations for the lens/patch UI; this
 * panel is the reflective activity a facilitator would otherwise run by hand.
 */

const PANEL_W = 340;

/**
 * Where the panel opens, floating, when the participant has never dragged it:
 * against the right edge, clear of the prompt boxes and Run button. Only reached
 * without a dock (mobile) — docked, the layout decides where it goes.
 */
const defaultPanelPos = () => ({
    x: Math.max(24, window.innerWidth - PANEL_W - 24),
    y: 96,
});

interface TutorialActivityPanelProps {
    onInsertPrompt: (text: string) => void;
    /** Prompt-bank "Try a prompt": fills the prompt and auto-runs it. Falls back
     * to onInsertPrompt (fill only) when not provided. */
    onTryPrompt?: (text: string) => void;
    /** Patch-unit "Load both prompts and run": fills source + target and runs them. */
    onInsertPatchPair?: (pair: { source: string; target: string }) => void;
    /** Point the widget's spotlight at one or more cells (show-me hints, and the
     * post-patch result); null clears it. */
    onSpotlight?: (target: SpotlightTarget | SpotlightTarget[] | null) => void;
    /** Bumped each time a run completes, so the panel can score the current unit. */
    runNonce: number;
    topToken: string | null;
    secondToken: string | null;
    /** The guided-tutorial unit the latest run was initiated from (null outside
     * the tutorial). Progress and the check answer key are both filed against that
     * unit, so a stale run can't score a unit it didn't belong to. */
    runUnitIdx: number | null;
    /** The `lens_runs` row the latest run was written to, stored with the answer key
     * so it can be validated against the run on screen after a reload. */
    runId: string | null;
    /** Terms kept reachable from the header; falls back to DEFAULT_GLOSSARY. */
    glossary?: GlossaryEntry[];
    /** The tutorial-wide default for what a check tells the participant about
     * their answer; a check's own `feedback` still wins (resolveCheckFeedback).
     *
     * Travels as a prop rather than through the store because the store carries
     * *progress*, not content: `setUnits` is the only content channel it has, and
     * this is a tutorial-level field, not a per-unit one. `glossary` above set the
     * same precedent for the same reason. */
    checkFeedback?: CheckFeedback;
    /** Per-workshop survey the finish screen links to (workshops.surveyUrl). */
    surveyUrl?: string;
    /** Optional per-workshop thank-you copy (legacy completion_text). */
    completionThanks?: string;
    /** In workshop mode the tutorial can't be closed, only minimized — so a
     * participant returns to the same place instead of losing it. */
    workshopMode?: boolean;
}

export function TutorialActivityPanel({
    onInsertPrompt,
    onTryPrompt,
    onInsertPatchPair,
    onSpotlight,
    runNonce,
    topToken,
    secondToken,
    runUnitIdx,
    runId,
    glossary,
    checkFeedback,
    surveyUrl,
    completionThanks,
    workshopMode = false,
}: TutorialActivityPanelProps) {
    const store = useProlificTutorial();
    const capture = useCapture();
    const queryClient = useQueryClient();
    const units = store.units;
    const unit = units[store.unitIdx];
    const dragControls = useDragControls();
    const constraintsRef = useRef<HTMLDivElement | null>(null);
    // A column to render into, when the layout offers one (desktop).
    const { available: docked, el: dockEl } = useTutorialDock();

    // Portal target — guarded so SSR renders nothing (createPortal needs the DOM).
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    // Feed each completed run into the store's success evaluation exactly once.
    const prevNonce = useRef(runNonce);
    useEffect(() => {
        if (runNonce === prevNonce.current) return;
        prevNonce.current = runNonce;
        // Score against the unit the run was initiated from (runUnitIdx), not the
        // unit that happens to be current now.
        if (store.active) {
            store.recordRun({ top: topToken, second: secondToken, runId }, runUnitIdx ?? undefined);
        }
        // topToken is captured at the nonce bump; store handles per-unit logic.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runNonce]);

    // Read before the mount/active guard below, so the spotlight derivation can
    // depend on them (a conditional hook isn't an option).
    const isPatchUnit = unit?.progression.on === "patch";
    const patchToken = store.patchTokenByUnit[store.unitIdx] ?? null;
    const hintStage = store.hintStageByUnit[store.unitIdx] ?? 0;

    // Everything this step spotlights, in one derived value: the layers it forces
    // on screen, the cells it rings on arrival, the cells of whatever hint rung has
    // been revealed, and — once a patch is filed — the result cell.
    //
    // This used to be three effects writing the same channel, each overwriting the
    // others. The one that hurt was the hint reveal: it was imperative, so nothing
    // re-applied it, and any remount (a reload, or collapsing and re-expanding the
    // dock, which unmounts the column the panel portals into) dropped the rings
    // while the hint on screen still read as revealed. The revealed stage is
    // persisted, so the rings can be derived from it instead of remembered.
    //
    // Two things the effects taught us, kept here:
    //  - Ringing a cell is also what forces the widget to render its layer —
    //    auto-fit downsamples layers to the column width, so the layer a step is
    //    about can be missing from a narrow grid. `forceLayers` does that job
    //    alone, for a step that must not ring anything (see resolveUnitSpotlights).
    //  - The patch result is ADDED to the step's own cells, never substituted for
    //    them (commit f3d193a). `patchToken` is not evidence a result grid is on
    //    screen: a patch restored from an earlier session is re-filed on arrival
    //    (PatchLensDisplay's "restored patch" effect) with nothing rendered, and
    //    substituting there deleted the two cells the step's task names — and with
    //    them the patch layer itself. Lighting both is safe: an unrendered result
    //    grid resolves to no cell, so the extra target is inert.
    //
    // Nothing is spotlit while the tutorial is off screen. The guard lives here
    // rather than being inherited from the render, because these hooks sit above
    // the `active` early-return (hooks can't be conditional).
    const spotlights = useMemo(
        () => (store.active ? resolveUnitSpotlights(unit, hintStage, patchToken != null) : null),
        [store.active, unit, hintStage, patchToken],
    );
    useEffect(() => {
        onSpotlight?.(spotlights);
        // onSpotlight is a prop the host redeclares every render; re-pushing on the
        // payload alone is what keeps this from thrashing the widget.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [spotlights]);

    // Back to the top of the step on arrival. The steps are long enough to scroll,
    // and the container keeps its offset across a unit change — so advancing from
    // the bottom of one step dropped the participant into the middle of the next
    // one, below its task, with no sign there was anything above.
    const bodyRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        bodyRef.current?.scrollTo({ top: 0 });
    }, [store.unitIdx]);

    // "Next step" nudges the participant to finish the current step first: the
    // first click on an unfinished step shows a hint instead of advancing (a
    // second click still moves on, so nobody gets stranded). Reset per unit.
    const [nudgeToFinish, setNudgeToFinish] = useState(false);
    useEffect(() => {
        setNudgeToFinish(false);
    }, [store.unitIdx]);

    // Reaching the end of the activity is what finishes it. The last step used to
    // gate the survey handoff behind completing it, which left a participant who had
    // worked through everything else staring at a step they couldn't get past.
    // `markReached` completes a manual final unit on arrival and is idempotent, so a
    // reload here doesn't double-count it. `units.length` is a dep because content
    // arrives from the DB a tick after mount.
    useEffect(() => {
        if (!store.active) return;
        store.markReached(store.unitIdx);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store.active, store.unitIdx, units.length]);

    // The participant's own saved reflections, for the header popover and the
    // completion recap.
    //
    // This is a server read — not a store read — because the note text is never
    // kept client-side: the reflection box clears on save, and
    // `submitObservation` records only a submitted flag in the persisted store
    // (the text goes straight to tutorial_events). So the DB is the only place a
    // participant's own note exists to be read back to them. Sits above the
    // `!store.active` guard below because hooks can't be conditional; the query
    // itself is gated on `store.active`, so nothing is fetched outside a tutorial.
    const workspaceId = store.workspaceId ?? undefined;
    const { data: savedNotes, isLoading: notesLoading } = useTutorialNotes(
        workspaceId,
        store.active,
    );
    const notes = useMemo(() => orderNotesByUnits(savedNotes ?? [], units), [savedNotes, units]);

    if (!mounted || !store.active || !unit) return null;
    // Collapsed and docked, the dock's own strip carries the way back — the page
    // takes the column away entirely rather than leaving a title bar behind.
    if (docked && store.collapsed) return null;

    const total = units.length;
    const attempts = store.attemptsByUnit[store.unitIdx] ?? 0;
    const completed = store.completedUnits.includes(store.unitIdx);
    const isLast = store.unitIdx === total - 1;

    // Embedded-check answer key + gate, read from THIS unit's frozen result rather
    // than from whatever ran most recently (see resolveCheckKey).
    //
    // The live-state version of this mis-scored anyone who went back to a unit to
    // fill in a check they had skipped: the source box still held a later unit's
    // prompt, so re-running it moved the answer key while the instructions on
    // screen still described this unit's prompt. The key is now pinned to the unit
    // the run was initiated from, and the prompt is restored on arrival
    // (PatchLensArea), so the key and the instructions describe the same run.
    // Bound to a const so the narrowing survives into the answer callback below.
    const unitCheck = unit.check;
    const { expected: checkExpected, canAnswer: checkHasRun } = resolveCheckKey(
        unit,
        store.runTokensByUnit[store.unitIdx],
        patchToken,
    );

    // Progressive reveal. The step leads with the task and everything that helps
    // the participant carry it out; the check and the note box arrive once they
    // have actually done it. Rendering all of it at once put two things to fill in
    // beside "try a prompt", where they compete with the instruction to go and do
    // the thing the step is about — and the instruction is the one that loses.
    //
    // The per-progression rule lives in `hasDoneUnitAction` (run / patch /
    // manual-is-always), including why *any* run counts and a failing
    // `successPredicate` must not suppress the reveal.
    const actionDone = hasDoneUnitAction(unit, store.runTokensByUnit[store.unitIdx], patchToken);
    // ...and once revealed on this step, it stays revealed. This override is
    // load-bearing rather than belt-and-braces: `runTokensByUnit` is persisted only
    // for entries naming a `lens_runs` row, and is pruned on load against the
    // chart's `activeLensRunId` (`pruneRunKeys`), so a step the participant
    // genuinely finished can read as un-run after a reload or a revisit. Without
    // these three, a check they had already answered and a note they had already
    // written would vanish from the step that holds them — which is the same
    // "you haven't run anything" regression the frozen answer keys were added to
    // fix, reintroduced one layer up.
    const revealActivity =
        actionDone ||
        !!store.checkAnsweredByUnit[store.unitIdx] ||
        !!store.observationByUnit[store.unitIdx] ||
        completed;

    // Clamp the persisted position into the current viewport (a window resize or
    // a different monitor could otherwise place it off-screen). Same bounds as
    // the drag-end clamp; reached only after mount, so `window` exists.
    const rawPos = store.panelPos ?? defaultPanelPos();
    const initialPos = {
        x: Math.min(Math.max(0, rawPos.x), Math.max(0, window.innerWidth - PANEL_W)),
        y: Math.min(Math.max(0, rawPos.y), Math.max(0, window.innerHeight - 120)),
    };

    // Per-unit "how to finish this step" nudge, derived from its progression.
    const finishHint =
        unit.progression.on === "patch"
            ? "Drag a source cell onto the target to finish this step."
            : unit.progression.on === "manual"
              ? "Add a note in the box above to finish this step."
              : "Run a prompt to finish this step.";

    // A note is the way back to the step it was written on, from either surface
    // that lists them. `goToUnit` guards the range and emits step_started, which
    // is the right event for a revisit — it is the same move as the Back button.
    // Resolved through the unit id rather than a stored index so an edited
    // tutorial can't send a participant to somebody else's step; a note whose
    // unit is gone renders no button at all (TutorialNotesList), so the miss
    // here is belt-and-braces.
    const handleJumpToStep = (stepId: string) => {
        const idx = units.findIndex((u) => u.id === stepId);
        if (idx < 0) return;
        // The finish nudge belongs to the step that raised it.
        setNudgeToFinish(false);
        store.goToUnit(idx);
    };

    const handleNext = () => {
        if (!completed && !nudgeToFinish) {
            setNudgeToFinish(true);
            return;
        }
        setNudgeToFinish(false);
        store.next();
    };

    // Saving a note writes it twice: through the store (which emits the
    // observation_submitted event carrying the text) and into the notes query
    // cache, so the header popover and the completion recap show it immediately.
    //
    // The cache seed is load-bearing, not an optimisation. The store's event
    // write is fire-and-forget, so invalidating here would fire a refetch that
    // races the insert and can hand back a list missing the note just written —
    // and with `staleTime: Infinity` that wrong list would then be the cached
    // truth. Keyed by `unit.id`, the same stable step id the store files the
    // event under (stepIdForUnit), never the array index: content edited between
    // sessions would otherwise re-attach a note to a different step. Replacing
    // any existing entry for this step matches the read path, which keeps the
    // latest note per step; append order doesn't matter, since orderNotesByUnits
    // re-sorts into unit order.
    const handleSaveNote = async (text: string) => {
        const notesKey = workspaceId
            ? queryKeys.tutorialEvents.notesByWorkspace(workspaceId)
            : null;
        // Snapshot before cancelling, and seed only if there was something to
        // seed onto. Two races pull in opposite directions here:
        //
        //  - If the initial fetch is still in flight, cancelling it and then
        //    seeding onto a `[]` default would publish a cache holding only this
        //    note — a returning participant's earlier notes would vanish from the
        //    recap until the popover's invalidate reconciled them.
        //  - If it has already settled, letting it commit *after* the seed would
        //    overwrite this note with a list that predates it.
        //
        // So: cancel and merge when we hold a snapshot, and otherwise leave the
        // read alone and let it bring the truth. Skipping the seed can leave the
        // just-written note out of the recap for a moment (the event write is
        // fire-and-forget, so the in-flight read may not see it), which is the
        // lesser of the two — dropping notes the participant already wrote is
        // worse than briefly missing the one they can still see on screen.
        const previousNotes = notesKey
            ? queryClient.getQueryData<TutorialNote[]>(notesKey)
            : undefined;
        if (notesKey && previousNotes !== undefined) {
            await queryClient.cancelQueries({ queryKey: notesKey });
        }
        store.submitObservation(text);
        if (!notesKey || previousNotes === undefined) return;
        queryClient.setQueryData<TutorialNote[]>(notesKey, [
            ...previousNotes.filter((n) => n.stepId !== unit.id),
            { stepId: unit.id, text: text.trim(), createdAt: new Date() },
        ]);
    };

    // Docked, the panel is a column of the tool's layout and wears the same header
    // as its neighbours; floating, it keeps its own drag handle and title bar.
    // The step itself. Identical in both placements; only the scroll container
    // differs — docked it fills the column, floating it grows to a max height.
    const body = store.collapsed ? null : (
        <div
            ref={bodyRef}
            className={`p-3 flex flex-col gap-3 overflow-auto ${docked ? "flex-1 min-h-0" : ""}`}
        >
            {/* Where you are. Kept out of the header so it never competes with the
                step title for a narrow column's width. */}
            <p className="text-xs text-muted-foreground tabular-nums">
                Step {store.unitIdx + 1} of {total}
            </p>

            {/* Task */}
            <p className="text-sm leading-snug">{unit.task}</p>

            {/* Concept callout — the facilitator move this unit replaces. */}
            <div className="rounded border-l-2 border-primary bg-primary/5 px-3 py-2 text-sm leading-snug">
                {unit.concept}
            </div>

            {/* Why the step is worth doing. Separate from `concept` on purpose:
                concept says what just happened, this says where it shows up outside
                the tutorial. Pilot participants completed the steps and asked what
                they were for. Plain surface, so it doesn't compete with the concept
                callout above it. */}
            {unit.why && (
                <div className="rounded border bg-muted/40 px-3 py-2">
                    <p className="text-xs font-medium">Why this matters</p>
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{unit.why}</p>
                </div>
            )}

            {/* Prompt bank — clicking a prompt fills + auto-runs it. */}
            {unit.prompts.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Try a prompt</p>
                    <div className="flex flex-col gap-1">
                        {unit.prompts.map((p) => (
                            <button
                                key={p}
                                type="button"
                                onClick={() => (onTryPrompt ?? onInsertPrompt)(p)}
                                title="Fill this prompt and run it"
                                className="text-left text-xs font-mono rounded border bg-background px-2 py-1 hover:border-primary/50 transition-colors whitespace-pre-wrap"
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                    {unit.patchPair && onInsertPatchPair && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-1 h-7 text-xs"
                            onClick={() => onInsertPatchPair(unit.patchPair!)}
                            title="Fill both prompts and run them"
                        >
                            Load both prompts and run
                        </Button>
                    )}
                </div>
            )}

            {/* Progressive hints */}
            <HintLadder
                key={`hint-${store.unitIdx}`}
                hints={unit.hints}
                revealedStage={hintStage}
                autoOffer={attempts >= HINT_AUTO_OFFER_AT && hintStage === 0}
                onReveal={() => {
                    const stage = store.revealHint();
                    const rung = unit.hints.find((h) => h.stage === stage);
                    if (rung?.insertPrompt) onInsertPrompt(rung.insertPrompt);
                    // The rung's cells are NOT lit from here. `revealHint` persists
                    // the stage, and the spotlight payload above is derived from it
                    // — so the rings survive a reload and a dock collapse, which an
                    // imperative call from this handler did not.
                }}
            />

            {/* What the patch did. The intervention is the hard part of
                        the tool and its result is one cell in a grid of
                        hundreds — easy to perform and then never find. */}
            {isPatchUnit && patchToken && (
                <div className="rounded border-l-2 border-primary bg-primary/5 px-3 py-2 text-sm leading-snug">
                    <p>
                        The target now predicts <span className="font-mono">{patchToken}</span>. It
                        is the bottom-right cell of the patched heatmap — ringed for you.
                    </p>
                    {/* The purple region is the clearest thing on screen after a
                        patch and nothing named it, so it read as decoration. It is
                        the reach of the intervention — which is the whole result. */}
                    <p className="mt-1.5 text-xs text-muted-foreground">
                        The purple cells in that heatmap are how far the patch reached. Purple is
                        the blue source mixed into the pink target: each of those cells sits after
                        the layer you dropped on, so its value was computed from the one you copied
                        in. Cells still pink were worked out independently of the patch.
                    </p>
                </div>
            )}

            {/* The reflective half of the step: the check and the note box, held
                back until the participant has done the step's action and then
                revealed together (see `revealActivity`).

                Together, not chained. Gating the note on the check being answered
                was considered and rejected: a participant who skips the check would
                then never be asked to reflect at all, and on a manual step the note
                IS the completion gate.

                The wrapper is always mounted and carries the live region, so the
                insertion of its children is what gets announced. A container that
                appears at the same moment as its content usually announces nothing —
                the region has to exist before it changes. Focus deliberately does
                not move: the participant is reading the heatmap when this fires, and
                pulling them into the panel mid-run is worse than saying nothing.
                `empty:hidden` keeps the parent's `gap-3` from doubling up here
                before the reveal. No animation — the content appears exactly where
                they are already looking. */}
            <div aria-live="polite" className="flex flex-col gap-3 empty:hidden">
                {/* Embedded check — auto-scored, log-only */}
                {revealActivity && unitCheck && (
                    <EmbeddedCheck
                        key={`check-${store.unitIdx}`}
                        check={unitCheck}
                        expected={checkExpected}
                        placeholder={unit.answerPlaceholder}
                        // Still passed, and still meaningful after the reveal: a
                        // `secondToken` check whose run returned a single top-k
                        // entry has no runner-up, so `resolveCheckKey` can return
                        // `canAnswer: false` on a step that HAS been run. The check
                        // then reads "run a prompt first" rather than scoring every
                        // answer against nothing. See EmbeddedCheck's `!hasRun`
                        // branch, which is not dead code.
                        hasRun={checkHasRun}
                        // Resolved here, not inside the check: this unit's own
                        // `feedback` if it sets one, else the tutorial's default.
                        // Note the first argument is the check, not the unit.
                        feedback={resolveCheckFeedback(unitCheck, checkFeedback)}
                        notRunMessage={
                            isPatchUnit ? "Apply the patch first, then answer." : undefined
                        }
                        // The key travels with the answer: a run-scored key is this
                        // unit's own run and is gone by the time anyone grades the
                        // data (see TutorialEventPayload.expected).
                        onAnswer={(answer, correct, expected) =>
                            store.answerCheck(answer, correct, {
                                expected,
                                checkKind: unitCheck.kind,
                            })
                        }
                        alreadyAnswered={!!store.checkAnsweredByUnit[store.unitIdx]}
                        priorResult={store.checkResultByUnit[store.unitIdx]}
                    />
                )}

                {/* Observation box */}
                {revealActivity && (
                    <ObservationBox
                        key={`obs-${store.unitIdx}`}
                        prompt={unit.observationPrompt}
                        placeholder={unit.observationPlaceholder}
                        submitted={!!store.observationByUnit[store.unitIdx]}
                        onSubmit={handleSaveNote}
                    />
                )}
            </div>

            {/* FAQ callouts */}
            {unit.faqs && unit.faqs.length > 0 && <FaqCallouts faqs={unit.faqs} />}

            {/* "Before you move on, try your own." Last thing in the step, next to
                Next, because that is the moment it has to compete with. Clicking a
                bank prompt is the path of least resistance from here to the end, and
                a participant who only ever does that never finds out the tool
                answers questions they brought themselves. */}
            {unit.tryYourOwn && (
                <p className="flex items-start gap-1.5 rounded border border-dashed px-3 py-2 text-xs leading-snug text-muted-foreground">
                    <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                    <span>
                        <span className="font-medium text-foreground">Try your own first.</span>{" "}
                        {unit.tryYourOwn}
                    </span>
                </p>
            )}

            {/* Reset / fresh-start */}
            <button
                type="button"
                onClick={() => onInsertPrompt("")}
                className="flex items-center gap-1 self-start text-xs text-muted-foreground/70 hover:text-foreground transition-colors"
                title="Clear the prompt — a fresh start means an empty context"
            >
                <RotateCcw className="h-3 w-3" />
                Start this step fresh (empty context)
            </button>

            {/* Finish screen on the final unit → survey handoff */}
            {isLast && (completed || store.observationByUnit[store.unitIdx]) && (
                <CompletionCta
                    surveyUrl={surveyUrl}
                    thanks={completionThanks}
                    notes={notes}
                    onJumpToStep={handleJumpToStep}
                />
            )}
        </div>
    );

    // Pinned under the step, in both placements: 'Next step' is the control that
    // moves the tutorial along, and it used to sit below the fold of a long step.
    const footer = store.collapsed ? null : (
        <div className="border-t p-3 flex flex-col gap-2">
            {/* Finish nudge — shown when Next is clicked on an unfinished step. */}
            {nudgeToFinish && !completed && !isLast && (
                <p className="flex items-start gap-1.5 text-xs text-yellow-600 dark:text-yellow-500 leading-snug">
                    <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                        {finishHint}{" "}
                        <span className="text-muted-foreground">
                            (or click Next again to move on.)
                        </span>
                    </span>
                </p>
            )}

            {/* Nav */}
            <div className="flex items-center justify-between">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={store.unitIdx === 0}
                    onClick={store.prev}
                >
                    Back
                </Button>
                <div className="flex items-center gap-1.5">
                    {completed && <span className="text-xs text-primary">✓ Step complete</span>}
                    {/* Last step: there is nowhere to go next, and an empty corner
                        left it unclear whether anything more was required. A manual
                        final unit is already complete on arrival (markReached), so
                        this only speaks to a run- or patch-gated one — and it no
                        longer asks for a note, which is no longer required. */}
                    {isLast && !completed && (
                        <span className="text-right text-xs leading-snug text-muted-foreground">
                            {finishHint}
                        </span>
                    )}
                    {!isLast && (
                        <Button
                            size="sm"
                            // Muted until the step is finished, so "Next" reads as
                            // secondary to actually completing the activity.
                            variant={completed ? "default" : "outline"}
                            className="h-7 text-xs"
                            onClick={handleNext}
                        >
                            Next step
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );

    const header = (
        <div
            className={
                docked
                    ? "p-3 border-b flex items-center justify-between gap-2"
                    : "flex items-center justify-between gap-2 border-b bg-secondary/60 dark:bg-secondary/40 px-3 py-2 rounded-t cursor-grab active:cursor-grabbing"
            }
            onPointerDown={docked ? undefined : (e) => dragControls.start(e)}
        >
            {/* Docked, this is the app's standard panel header: the title as a direct
                <h2 className="text-sm pl-2 font-medium">, then a controls group. The
                step counter deliberately does NOT sit here — beside the title the two
                competed for a ~280px column and the title lost ("Read one prediction"
                rendered as "Read one …" at 1366×768, the width the study runs at). It
                lives at the top of the step body instead. Floating, the header also
                carries the drag handle. */}
            {docked ? (
                <h2 className="text-sm pl-2 font-medium truncate">{unit.title}</h2>
            ) : (
                <div className="flex min-w-0 items-center gap-1.5">
                    <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                    <h2 className="truncate text-sm font-medium">{unit.title}</h2>
                </div>
            )}
            <div className="flex items-center gap-2 shrink-0">
                {/* Reachable on every step, not just the one that introduced the
                    term — the most consistent feedback on the tool is its entry cost. */}
                <TutorialGlossary
                    entries={glossary?.length ? glossary : DEFAULT_GLOSSARY}
                    onOpen={() => capture("tutorial_glossary_opened", { unit_id: unit.id })}
                />
                {/* Beside the glossary, and for the same reason: each step's
                    reflection box clears when the step advances, so re-reading
                    what you noticed two steps ago needs a surface of its own. */}
                <TutorialNotes
                    notes={notes}
                    loading={notesLoading}
                    onJumpToStep={handleJumpToStep}
                    onOpen={() => {
                        // Unit id and a count only — a participant's note text
                        // must never reach PostHog.
                        capture("tutorial_notes_opened", {
                            unit_id: unit.id,
                            note_count: notes.length,
                        });
                        // The query is staleTime: Infinity and kept warm by the
                        // optimistic write on save, so it never refetches on its
                        // own. Opening the popover is the one moment staleness
                        // would be visible — a note written in a second tab, or
                        // one whose fire-and-forget event write failed — so that
                        // is where the refresh goes. The cached list stays on
                        // screen meanwhile, so this can't flash an empty state.
                        if (workspaceId)
                            void queryClient.invalidateQueries({
                                queryKey: queryKeys.tutorialEvents.notesByWorkspace(workspaceId),
                            });
                    }}
                />
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
                    title={store.collapsed ? "Expand tutorial" : "Collapse tutorial"}
                    // Keep the header's drag gesture from swallowing the tap (a few
                    // px of finger slide on touch would otherwise drag, not click).
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => store.setCollapsed(!store.collapsed)}
                >
                    {/* Docked, collapsing puts the tutorial away sideways — the same
                        gesture and icon set as the chart sidebar opposite it. */}
                    {docked ? (
                        <PanelRightClose className="h-3.5 w-3.5" />
                    ) : store.collapsed ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                        <Minus className="h-3.5 w-3.5" />
                    )}
                </Button>
                {/* Workshop participants can only minimize (not close) so they
                    return to the same step instead of losing their place. */}
                {!workshopMode && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
                        title="Exit tutorial"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={store.stop}
                    >
                        <X className="h-3.5 w-3.5" />
                    </Button>
                )}
            </div>
        </div>
    );

    if (docked) {
        // The column mounts a tick after `active` flips; nothing to portal into yet.
        if (!dockEl) return null;
        return createPortal(
            <section
                aria-label="Guided tutorial"
                className="flex h-full min-h-0 flex-col bg-background"
            >
                {header}
                {body}
                {footer}
            </section>,
            dockEl,
        );
    }

    return createPortal(
        <div
            ref={constraintsRef}
            className="pointer-events-none fixed inset-0 z-50"
            aria-hidden={false}
        >
            <motion.section
                aria-label="Guided tutorial"
                drag
                dragControls={dragControls}
                dragListener={false}
                dragMomentum={false}
                dragConstraints={constraintsRef}
                dragElastic={0}
                initial={{ x: initialPos.x, y: initialPos.y }}
                onDragEnd={(_e, info) => {
                    // info.offset is the raw pointer delta (dragConstraints only
                    // pin the element visually), so clamp before persisting — an
                    // over-drag would otherwise save an off-screen coordinate that
                    // an in-session exit→reopen remounts to, hiding the panel. Same
                    // bounds as the render-time clamp above (the store persists the
                    // raw position; clamping happens here and at render, not on
                    // rehydrate).
                    const maxX = Math.max(0, window.innerWidth - PANEL_W);
                    const maxY = Math.max(0, window.innerHeight - 120);
                    store.setPanelPos({
                        x: Math.min(Math.max(0, initialPos.x + info.offset.x), maxX),
                        y: Math.min(Math.max(0, initialPos.y + info.offset.y), maxY),
                    });
                }}
                style={{ position: "absolute", top: 0, left: 0 }}
                className="pointer-events-auto w-[340px] max-w-[calc(100vw-2rem)] rounded border bg-background shadow-lg flex flex-col max-h-[calc(100vh-8rem)]"
            >
                {header}
                {body}
                {footer}
            </motion.section>
        </div>,
        document.body,
    );
}

// ---- sub-components ----

function HintLadder({
    hints,
    revealedStage,
    autoOffer,
    onReveal,
}: {
    hints: HintRung[];
    revealedStage: number;
    autoOffer: boolean;
    onReveal: () => void;
}) {
    // Highest actual rung stage (not the count) — hint stages may be
    // non-contiguous, so the "more hints" affordance keys off the max value.
    const maxStage = hints.reduce((m, h) => Math.max(m, h.stage), 0);
    const revealed = hints.filter((h) => h.stage <= revealedStage);
    return (
        <div className="flex flex-col gap-1.5">
            {revealed.map((h) => (
                <p
                    key={h.stage}
                    className="flex items-start gap-1.5 text-xs text-muted-foreground leading-snug"
                >
                    <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5 text-yellow-500" />
                    <span>{h.text}</span>
                </p>
            ))}
            {revealedStage < maxStage && (
                <button
                    type="button"
                    onClick={onReveal}
                    className={`flex items-center gap-1 self-start text-xs transition-colors ${
                        autoOffer
                            ? "text-yellow-600 dark:text-yellow-500 font-medium"
                            : "text-muted-foreground/60 hover:text-foreground"
                    }`}
                >
                    <HelpCircle className="h-3 w-3" />
                    {autoOffer
                        ? "Stuck? Get a hint"
                        : revealedStage === 0
                          ? "Stuck? Get a hint"
                          : "Another hint"}
                </button>
            )}
        </div>
    );
}

function EmbeddedCheck({
    check,
    expected,
    placeholder,
    hasRun,
    feedback,
    notRunMessage,
    alreadyAnswered,
    priorResult,
    onAnswer,
}: {
    check: UnitCheck;
    /** The run-derived answer key; unused by a choice check, which carries its own. */
    expected: string | null;
    placeholder?: string;
    hasRun: boolean;
    /** Whether to tell the participant if they were right. Required, and resolved
     * by the caller (resolveCheckFeedback) rather than read off `check` here, so
     * this component stays presentational and never has to know which tutorial
     * — classroom or paid study — the check it is rendering came from. */
    feedback: CheckFeedback;
    notRunMessage?: string;
    alreadyAnswered: boolean;
    /** What this participant answered on an earlier visit (persisted). Lets a
     * revisited step restate their answer and whether it was right, instead of the
     * bare "already answered" that a locked check used to show. */
    priorResult?: { answer: string; correct: boolean };
    /** `expected` is the key the answer was scored against — a choice check's own
     * option, or the run-derived key — so the caller can log it. */
    onAnswer: (answer: string, correct: boolean, expected: string | null) => void;
}) {
    const [value, setValue] = useState("");
    const [result, setResult] = useState<null | { correct: boolean; expected: string }>(null);
    // Lock once answered — locally this render or already answered on a prior
    // visit (checkAnsweredByUnit). Prevents a re-answer from emitting a duplicate
    // check_answered event that would skew the analytics funnel.
    const locked = !!result || alreadyAnswered;
    const isChoice = check.kind === "choice";
    // A choice check serves two different questions: "which of these tokens did you
    // see?" and "which of these statements is true?". Decide per group rather than
    // per option so the set reads consistently — every option short and space-free
    // is a token set; anything else is prose.
    const optionsAreTokens =
        isChoice &&
        check.options.every((o) => o.trim().length <= 12 && !/\s/.test(o.trim()) && o.length > 0);

    const submitTyped = () => {
        if (!value.trim() || locked) return;
        // One folding rule, shared with the tests that pin it (normalizeAnswer
        // lives in tutorial-content): two copies of it here and there would let
        // "what counts as the same answer" drift between the grader and its spec.
        const correct = normalizeAnswer(value) === normalizeAnswer(expected);
        setResult({ correct, expected: expected ?? "?" });
        onAnswer(value.trim(), correct, expected);
    };

    const submitChoice = (idx: number) => {
        if (locked || check.kind !== "choice") return;
        const correct = idx === check.correctIndex;
        const key = check.options[check.correctIndex] ?? null;
        setResult({ correct, expected: key ?? "?" });
        onAnswer(check.options[idx] ?? String(idx), correct, key);
    };

    // The correct answer, for restating a wrong prior answer. A choice check
    // carries its own key; a typed one's key is the run it was scored against,
    // which a fresh session may no longer have.
    const correctAnswer = isChoice ? check.options[check.correctIndex] : expected;
    // Neutral unless the content opts in, resolved upstream from the tutorial's
    // own default and this check's override of it. A check scored against the
    // participant's own run is often ambiguous — a token they cannot type as it
    // renders, a spelling `normalizeAnswer` does not fold — and being marked
    // wrong on one of those discourages a participant who did the step
    // correctly. The score still reaches `answerCheck` either way, so the
    // engagement measure is unaffected by what is shown here.
    const showVerdict = feedback === "verdict";

    return (
        // The testids are the check root and its verdict line, and nothing else:
        // the visible verdict strings interpolate an answer key into curly quotes
        // and an em-dash, so a suite asserting those everywhere fails on a copy
        // tweak. Tests read the boolean `data-correct` attribute for the verdict
        // and pin the exact string once per shape as a deliberate copy guard.
        <div
            data-testid="tutorial-check"
            className="rounded border bg-background p-2.5 flex flex-col gap-1.5"
        >
            <p className="text-xs font-medium">{check.question}</p>
            {/* A prior answer outranks the "run first" gate: this participant has
                already answered, so asking them to re-run a prompt to see what they
                said is busywork — the check is locked either way.

                This branch is NOT dead now that the panel hides the whole check
                until the step's action is done. `resolveCheckKey` can still return
                `canAnswer: false` *after* a run: a `secondToken` check whose top-k
                came back with a single entry has no runner-up to score against. The
                two gates ask different questions — "have they done the step" vs "is
                there a key" — so don't collapse them. */}
            {!hasRun && !priorResult ? (
                <p className="text-xs text-muted-foreground">
                    {notRunMessage ?? "Run a prompt first, then answer."}
                </p>
            ) : (
                <>
                    {isChoice ? (
                        // One click per option: a token the participant can see but
                        // cannot type (a space, a newline, a punctuation glyph) is
                        // still answerable, and the answers stay comparable.
                        <div
                            role="group"
                            aria-label={check.question}
                            className="flex flex-col gap-1"
                        >
                            {check.options.map((option, idx) => (
                                <Button
                                    // Index, not the label: two options can read the
                                    // same and nothing requires them to be unique.
                                    key={`${idx}-${option}`}
                                    size="sm"
                                    variant="outline"
                                    className={`h-auto justify-start whitespace-normal py-1 text-left text-xs ${
                                        // Mono for a set of tokens (data the
                                        // participant is reading off the grid), not
                                        // for a set of prose answers — a conceptual
                                        // question in monospace reads as code.
                                        optionsAreTokens ? "font-mono" : ""
                                    }`}
                                    disabled={locked}
                                    onClick={() => submitChoice(idx)}
                                >
                                    {option}
                                </Button>
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5">
                            <Input
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && submitTyped()}
                                placeholder={placeholder ?? "Your answer"}
                                aria-label={check.question}
                                className="h-7 text-xs"
                                disabled={locked}
                            />
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={submitTyped}
                                disabled={locked || !value.trim()}
                            >
                                {/* "Check" promises a verdict; a neutral check
                                    does not give one. */}
                                {showVerdict ? "Check" : "Submit"}
                            </Button>
                        </div>
                    )}
                    {result &&
                        (showVerdict ? (
                            <p
                                data-testid="tutorial-check-verdict"
                                data-correct={String(result.correct)}
                                data-state="fresh"
                                className={`text-xs ${result.correct ? "text-primary" : "text-muted-foreground"}`}
                            >
                                {result.correct
                                    ? "✓ Correct."
                                    : `Not quite — the answer was “${result.expected}”.`}
                            </p>
                        ) : (
                            <p className="text-xs text-muted-foreground">Answer recorded.</p>
                        ))}
                    {!result &&
                        priorResult &&
                        (showVerdict ? (
                            <p
                                data-testid="tutorial-check-verdict"
                                data-correct={String(priorResult.correct)}
                                data-state="prior"
                                className={`text-xs ${priorResult.correct ? "text-primary" : "text-muted-foreground"}`}
                            >
                                {priorResult.correct
                                    ? `✓ You answered “${priorResult.answer}” — correct.`
                                    : `You answered “${priorResult.answer}” — not quite.`}
                                {!priorResult.correct &&
                                    correctAnswer &&
                                    ` The answer was “${correctAnswer}”.`}
                            </p>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                You answered “{priorResult.answer}”.
                            </p>
                        ))}
                    {/* Fallback for a participant whose stored progress predates
                        `checkResultByUnit`: their answer wasn't kept, so all we can
                        honestly say is that they answered. */}
                    {alreadyAnswered && !result && !priorResult && (
                        <p className="text-xs text-muted-foreground">Already answered this step.</p>
                    )}
                </>
            )}
        </div>
    );
}

function ObservationBox({
    prompt,
    placeholder,
    submitted,
    onSubmit,
}: {
    prompt: string;
    placeholder?: string;
    submitted: boolean;
    onSubmit: (text: string) => void;
}) {
    const [value, setValue] = useState("");
    const [done, setDone] = useState(submitted);
    const fieldId = useId();

    const submit = () => {
        if (!value.trim()) return;
        onSubmit(value.trim());
        setDone(true);
    };

    if (done) {
        return (
            <div className="rounded border border-primary/30 bg-primary/5 p-2.5">
                <p className="text-xs font-medium">{prompt}</p>
                <p className="mt-1 text-xs text-primary">✓ Thanks — your note was saved.</p>
            </div>
        );
    }

    // Same container as the submitted state above: the note prompt used to be a
    // bare label between a bordered check box and a bordered FAQ list, so it read
    // as one more paragraph of the step rather than something being asked of the
    // participant — and the box didn't change shape on save.
    return (
        <div className="flex flex-col gap-1.5 rounded border border-primary/30 bg-primary/5 p-2.5">
            <label htmlFor={fieldId} className="text-xs font-medium">
                {prompt}
            </label>
            <Textarea
                id={fieldId}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                }}
                placeholder={placeholder ?? "What did you notice? (⌘/Ctrl-Enter to save)"}
                // Opaque against the tinted surface, so the field still reads as
                // somewhere to type.
                className="min-h-16 bg-background text-xs"
            />
            <Button
                size="sm"
                variant="outline"
                className="h-7 self-end text-xs"
                onClick={submit}
                disabled={!value.trim()}
            >
                Save note
            </Button>
        </div>
    );
}

function FaqCallouts({ faqs }: { faqs: { q: string; a: string }[] }) {
    const [open, setOpen] = useState<number | null>(null);
    return (
        <div className="flex flex-col gap-1">
            {faqs.map((f, i) => (
                <div key={f.q} className="rounded border bg-background">
                    <button
                        type="button"
                        onClick={() => setOpen(open === i ? null : i)}
                        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs font-medium"
                    >
                        {open === i ? (
                            <ChevronDown className="h-3 w-3 shrink-0" />
                        ) : (
                            <ChevronRight className="h-3 w-3 shrink-0" />
                        )}
                        {/* The question stands on its own. "Curious?" prefixed every
                            one of these, which read as a nudge to open all of them —
                            including the ones a stuck participant needs, where an
                            aside's framing is actively unhelpful. */}
                        {f.q}
                    </button>
                    {open === i && (
                        <p className="px-2 pb-2 pl-6 text-xs text-muted-foreground leading-snug">
                            {f.a}
                        </p>
                    )}
                </div>
            ))}
        </div>
    );
}
