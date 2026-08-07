"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { useProlificTutorial, HINT_AUTO_OFFER_AT } from "@/stores/useProlificTutorial";
import type { GlossaryEntry, HintRung, SpotlightTarget, UnitCheck } from "@/types/tutorial-content";
import { resolveCheckKey } from "@/types/tutorial-content";
import { DEFAULT_GLOSSARY } from "@/tutorials/glossary";
import { CompletionCta } from "./CompletionCta";
import { TutorialGlossary } from "./TutorialGlossary";
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

// Normalize a token/answer for comparison: strip a leading SentencePiece marker
// (▁ U+2581), the heatmap's displayed space glyph (␣ U+2423), an ASCII
// underscore, and whitespace — so "Paris" matches a "␣Paris"/"▁Paris"/"_Paris"
// token however the participant types the leading space.
const norm = (s: string | null | undefined) =>
    (s ?? "")
        .trim()
        .toLowerCase()
        .replace(/^[▁␣_\s]+/, "");

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
    /** Terms kept reachable from the header; falls back to DEFAULT_GLOSSARY. */
    glossary?: GlossaryEntry[];
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
    glossary,
    surveyUrl,
    completionThanks,
    workshopMode = false,
}: TutorialActivityPanelProps) {
    const store = useProlificTutorial();
    const capture = useCapture();
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
            store.recordRun({ top: topToken, second: secondToken }, runUnitIdx ?? undefined);
        }
        // topToken is captured at the nonce bump; store handles per-unit logic.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runNonce]);

    // Read before the mount/active guard below, so the patch-result effect can
    // depend on them (a conditional hook isn't an option).
    const isPatchUnit = unit?.progression.on === "patch";
    const patchToken = store.patchTokenByUnit[store.unitIdx] ?? null;

    // On arriving at a unit, ring the cells that unit asks about — and clear
    // whatever the previous unit lit. Declared before the patch-result effect so
    // that on arriving back at a patched step, this runs and that one re-lights,
    // in the same commit.
    //
    // Unit-level spotlights are not a nicety on the patch step. Its task says
    // "drag this ringed cell onto that one", which was a lie while spotlights only
    // fired on a revealed hint; and the ring is also what forces the widget to
    // render that layer at all, since auto-fit downsamples layers to the column
    // width and a narrow display can drop the layer the step is about.
    const unitSpotlights = unit?.spotlights;
    const spotlitPatch = useRef<string | null>(null);
    useEffect(() => {
        spotlitPatch.current = null;
        onSpotlight?.(unitSpotlights?.length ? unitSpotlights : null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store.unitIdx, store.active, unitSpotlights]);

    // Point at the target's post-patch output the moment a patch lands. On the
    // step carrying the whole point of the tool, participants performed the
    // intervention successfully and then could not find its result — the panel
    // now says what changed (below) and rings the cell it changed in.
    useEffect(() => {
        // Nothing is spotlit while the tutorial is off screen: these effects sit
        // above the `active` guard (hooks can't be conditional), so the invariant
        // has to be stated here rather than inherited from the render.
        if (!store.active || !isPatchUnit || patchToken == null) return;
        if (spotlitPatch.current === patchToken) return;
        spotlitPatch.current = patchToken;
        onSpotlight?.({ grid: "result", layer: "last", position: "last" });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store.active, isPatchUnit, patchToken]);

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

    if (!mounted || !store.active || !unit) return null;
    // Collapsed and docked, the dock's own strip carries the way back — the page
    // takes the column away entirely rather than leaving a title bar behind.
    if (docked && store.collapsed) return null;

    const total = units.length;
    const attempts = store.attemptsByUnit[store.unitIdx] ?? 0;
    const hintStage = store.hintStageByUnit[store.unitIdx] ?? 0;
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
    const { expected: checkExpected, canAnswer: checkHasRun } = resolveCheckKey(
        unit,
        store.runTokensByUnit[store.unitIdx],
        patchToken,
    );
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

    const handleNext = () => {
        if (!completed && !nudgeToFinish) {
            setNudgeToFinish(true);
            return;
        }
        setNudgeToFinish(false);
        store.next();
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
                    // A rung may light several cells — both ends of a
                    // drag, say. `spotlights` wins over `spotlight`.
                    const cells = rung?.spotlights?.length ? rung.spotlights : rung?.spotlight;
                    if (cells) onSpotlight?.(cells);
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

            {/* Embedded check — auto-scored, log-only */}
            {unit.check && (
                <EmbeddedCheck
                    key={`check-${store.unitIdx}`}
                    check={unit.check}
                    expected={checkExpected}
                    placeholder={unit.answerPlaceholder}
                    // Only answerable once THIS unit's action has run —
                    // the answer key (a run's tokens, or the patch
                    // outcome) belongs to this unit, so scoring a
                    // different unit's answer against it would be wrong.
                    // A stale result reads as "do the step first" rather
                    // than auto-scoring.
                    hasRun={checkHasRun}
                    notRunMessage={isPatchUnit ? "Apply the patch first, then answer." : undefined}
                    onAnswer={(answer, correct) => store.answerCheck(answer, correct)}
                    alreadyAnswered={!!store.checkAnsweredByUnit[store.unitIdx]}
                />
            )}

            {/* Observation box */}
            <ObservationBox
                key={`obs-${store.unitIdx}`}
                prompt={unit.observationPrompt}
                placeholder={unit.observationPlaceholder}
                submitted={!!store.observationByUnit[store.unitIdx]}
                onSubmit={(text) => store.submitObservation(text)}
            />

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
                <CompletionCta surveyUrl={surveyUrl} thanks={completionThanks} />
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
                        left it unclear that anything more was required. Say what
                        finishes the activity — for a manual step like the final
                        challenge, submitting the observation is what completes it. */}
                    {isLast && !completed && (
                        <span className="text-right text-xs leading-snug text-muted-foreground">
                            Finish this step and save a note to complete the activity.
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
    notRunMessage,
    alreadyAnswered,
    onAnswer,
}: {
    check: UnitCheck;
    /** The run-derived answer key; unused by a choice check, which carries its own. */
    expected: string | null;
    placeholder?: string;
    hasRun: boolean;
    notRunMessage?: string;
    alreadyAnswered: boolean;
    onAnswer: (answer: string, correct: boolean) => void;
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
        const correct = norm(value) === norm(expected);
        setResult({ correct, expected: expected ?? "?" });
        onAnswer(value.trim(), correct);
    };

    const submitChoice = (idx: number) => {
        if (locked || check.kind !== "choice") return;
        const correct = idx === check.correctIndex;
        setResult({ correct, expected: check.options[check.correctIndex] ?? "?" });
        onAnswer(check.options[idx] ?? String(idx), correct);
    };

    return (
        <div className="rounded border bg-background p-2.5 flex flex-col gap-1.5">
            <p className="text-xs font-medium">{check.question}</p>
            {!hasRun ? (
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
                                Check
                            </Button>
                        </div>
                    )}
                    {result && (
                        <p
                            className={`text-xs ${result.correct ? "text-primary" : "text-muted-foreground"}`}
                        >
                            {result.correct
                                ? "✓ Correct."
                                : `Not quite — the answer was “${result.expected}”.`}
                        </p>
                    )}
                    {alreadyAnswered && !result && (
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

    return (
        <div className="flex flex-col gap-1.5">
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
                className="min-h-16 text-xs"
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
                        Curious? {f.q}
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
