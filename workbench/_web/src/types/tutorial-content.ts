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
    // Known-good completion prompts (insert-on-click); first entry is the default.
    prompts: string[];
    // For patch units, a source/target pair to preload.
    patchPair?: { source: string; target: string };
    hints: HintRung[];
    check?: UnitCheck;
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
     * Terms the panel keeps available on every unit. Omit to use
     * `DEFAULT_GLOSSARY` (`src/tutorials/glossary.ts`) — a term explained once in
     * an early unit is otherwise unreachable by the time it matters.
     */
    glossary?: GlossaryEntry[];
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
