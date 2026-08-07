/**
 * Tutorial content contract — the jsonb `$type<T>()` shape stored in the
 * `tutorials` table (`data` column) and edited through the workshop admin UI.
 *
 * This replaces the hard-coded `TUTORIAL_UNITS` fixture: content now lives in
 * the DB, seeded with the Jul-2026 Prolific Patch Lens tutorial as a demo. The
 * interfaces stay in code because they are the storage contract; the *values*
 * live in the DB. Progression is data-driven (see `UnitProgression`) so the
 * runtime store never switches on a specific unit id.
 */

export type UnitKind = "lens" | "patch" | "explore" | "challenge";

/**
 * A cell/token the tutorial can spotlight inside the edulogitlens widget (via
 * the widget's SpotlightProvider/useSpotlight context). `"last"` resolves at
 * render time to the last layer / last input position, so content doesn't
 * hard-code a model's layer count.
 */
export interface SpotlightTarget {
    grid: "source" | "target" | "result";
    layer: number | "last";
    position: number | "last";
}

/** A hint-ladder rung: 1 = nudge, 2 = concrete suggestion, 3 = show-me. */
export interface HintRung {
    stage: number;
    text: string;
    // Show-me rung: a prompt to insert on reveal.
    insertPrompt?: string;
    // Show-me rung: a widget cell to spotlight on reveal.
    spotlight?: SpotlightTarget;
    // Show-me rung: several cells to spotlight at once — a patching hint should
    // light both ends of the drag, since naming the drop cell in prose is what
    // makes the interaction undiscoverable. Wins over `spotlight` when both are
    // present.
    spotlights?: SpotlightTarget[];
}

/**
 * An embedded engagement check. Either auto-scored against the participant's own
 * run (`topToken` / `secondToken`), or a fixed multiple choice.
 */
export interface RunScoredCheck {
    question: string;
    // Which facet of the run result the answer is compared against.
    kind: "topToken" | "secondToken";
}

/**
 * A multiple choice with a static answer key. Free-text token answers are
 * ambiguous — a participant who cannot type the glyph they see (a space, a
 * newline, punctuation) answers a different question instead — so a check whose
 * point is engagement verification rather than typing accuracy uses this.
 */
export interface ChoiceCheck {
    question: string;
    kind: "choice";
    options: string[];
    correctIndex: number;
}

export type UnitCheck = RunScoredCheck | ChoiceCheck;

/** A term the tutorial uses, kept reachable from every unit. */
export interface GlossaryEntry {
    term: string;
    definition: string;
}

/**
 * One slide of the welcome slideshow — the orientation that runs before step 1.
 *
 * `body` is markdown (rendered by TutorialWelcomeDialog); `cards` renders
 * term/definition tiles, which is what a vocabulary slide wants. A slide may
 * carry either, or both.
 */
export interface WelcomeSlide {
    title: string;
    body?: string;
    cards?: GlossaryEntry[];
}

/**
 * The modal orientation shown when the guided tutorial starts: a few slides that
 * carry the framing and the vocabulary, then a hand-off to the reactour
 * walkthrough that points at the actual controls.
 *
 * This exists because the framing used to live in a paragraph pinned above the
 * prompt boxes, where it was a wall of grey text on the one column a participant
 * has to use — read by nobody, and occupying the space the task needs. Orientation
 * belongs in a surface a participant dismisses once.
 */
export interface TutorialWelcome {
    slides: WelcomeSlide[];
    /** Label for the button that closes the slides and starts the tour. */
    tourCta?: string;
}

/**
 * How a unit is marked complete. Replaces the old `unit3SuccessPredicate`
 * function + `kind === "lens"` switch with data the store evaluates generically.
 * - `on: "run"` — completes when a lens run satisfies `successPredicate`
 *   (default `always`); a failing run with a real predicate counts as a hint
 *   attempt.
 * - `on: "patch"` — completes when an activation-patching intervention is applied.
 * - `on: "manual"` — never auto-completes (explore / final challenge; the finish
 *   CTA gates on an observation instead).
 */
export type SuccessPredicate = { kind: "always" } | { kind: "topTokenNotEqual"; value: string };

export interface UnitProgression {
    on: "run" | "patch" | "manual";
    successPredicate?: SuccessPredicate;
}

export interface TutorialUnit {
    id: string;
    kind: UnitKind;
    title: string;
    // The task the participant performs.
    task: string;
    // The concept callout — the facilitator sentence it replaces.
    concept: string;
    /**
     * Why this step is worth doing: what the participant is learning and where it
     * shows up outside the tutorial. `concept` says what just happened; this says
     * why to care. Optional so older content stays valid.
     */
    why?: string;
    // Known-good completion prompts (insert-on-click); first entry is the default.
    prompts: string[];
    // For patch units, a source/target pair to preload.
    patchPair?: { source: string; target: string };
    /**
     * Cells to ring as soon as the participant arrives at this unit, before any
     * hint is revealed.
     *
     * A hint-only spotlight is not enough for the patch step: the drag is the one
     * interaction prose cannot convey, so the step's own instructions have to be
     * able to say "drag this cell onto that one" and have the cells actually
     * marked. It also forces the widget to render those layers — auto-fit
     * downsamples layers to the available width, and in a narrow column the layer
     * a hint wants to point at may not be on screen at all.
     *
     * Leave unset on a step whose task IS to find the cell; ringing it on arrival
     * does that work for the participant.
     */
    spotlights?: SpotlightTarget[];
    hints: HintRung[];
    check?: UnitCheck;
    /**
     * A nudge to run something of their own before advancing, shown at the end of
     * the step. Separate from `prompts` on purpose: the bank is known-good prompts
     * that keep a stuck participant moving, and clicking one is the path of least
     * resistance all the way to the end. This is the invitation to leave it.
     */
    tryYourOwn?: string;
    // The reflective prompt for the observation box.
    observationPrompt: string;
    // Per-unit contextual placeholders (fall back to generic copy when absent).
    answerPlaceholder?: string;
    observationPlaceholder?: string;
    faqs?: { q: string; a: string }[];
    progression: UnitProgression;
}

export interface TutorialContent {
    version: number;
    units: TutorialUnit[];
    /**
     * The modal orientation slideshow shown when the tutorial starts (and
     * re-openable from the Tutorial menu). Omit to start straight on step 1.
     */
    welcome?: TutorialWelcome;
    /**
     * Terms the panel keeps available on every unit. Omit to use
     * `DEFAULT_GLOSSARY` (`src/tutorials/glossary.ts`) — a term explained once in
     * an early unit is otherwise unreachable by the time it matters.
     */
    glossary?: GlossaryEntry[];
}

/**
 * The answer key for a unit's embedded check, and whether it can be answered yet.
 *
 * Kept as a pure function (rather than inline in the panel) because this is where
 * the mis-scoring bug lived: the key has to come from the unit's *own* result, and
 * the check must stay closed when there is no key to score against.
 *
 * @param runTokens the top two tokens from a lens run initiated on this unit
 * @param patchToken the target's post-patch top token, from a patch on this unit
 */
export function resolveCheckKey(
    unit: TutorialUnit,
    runTokens: { topToken: string; secondToken: string | null } | undefined,
    patchToken: string | null,
): { expected: string | null; canAnswer: boolean } {
    const check = unit.check;
    if (!check) return { expected: null, canAnswer: false };
    // A choice check carries its own key, so it needs no run at all.
    if (check.kind === "choice") {
        return { expected: check.options[check.correctIndex] ?? null, canAnswer: true };
    }
    // Kind first, then the unit's progression: a `secondToken` check always asks
    // about the run, even on a patch unit, where `topToken` means the patch outcome.
    const expected =
        check.kind === "secondToken"
            ? (runTokens?.secondToken ?? null)
            : unit.progression.on === "patch"
              ? patchToken
              : (runTokens?.topToken ?? null);
    // No key, no question: a run whose top-k had a single entry has no runner-up,
    // and scoring an answer against nothing marks every answer wrong and logs a
    // check_answered nobody could have got right.
    return { expected, canAnswer: expected != null };
}

/** Evaluate a unit's run-based success predicate against the run's top token. */
export function evalSuccessPredicate(
    predicate: SuccessPredicate | undefined,
    topToken: string | null,
): boolean {
    const pred = predicate ?? { kind: "always" };
    if (pred.kind === "always") return true;
    // topTokenNotEqual: success = the model said something other than `value`
    // (e.g. unit 3's "make 5+5 ≠ 10"). Trim so a leading-space token still matches.
    if (pred.kind === "topTokenNotEqual") {
        if (!topToken) return false;
        return topToken.trim() !== pred.value;
    }
    return false;
}
