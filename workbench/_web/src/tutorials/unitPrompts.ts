import type { TutorialUnit } from "@/types/tutorial-content";

/**
 * Prompt-box contents to apply when a participant arrives at a tutorial unit.
 * Only the boxes that need changing are present.
 */
export interface UnitPromptRestore {
    source?: string;
    target?: string;
}

const clean = (s: string | undefined | null) => (s ?? "").trim();

/** Every prompt string a unit claims: its bank plus its patch pair. */
const promptsOwnedBy = (unit: TutorialUnit): string[] =>
    [...unit.prompts, unit.patchPair?.source, unit.patchPair?.target].map(clean).filter(Boolean);

/**
 * What to put in the prompt boxes when the participant arrives at `units[unitIdx]`.
 *
 * Navigating between units used to leave whatever was last run in the boxes, so a
 * revisited step showed instructions describing one prompt while the tool held
 * another — and a re-run there scored that step's check against the wrong prompt's
 * output. Restoring the step's own prompt makes the instructions and the screen
 * agree again.
 *
 * A prompt the participant wrote themselves is never touched: only an empty box,
 * or one holding a prompt that belongs to a *different* unit, is replaced. That
 * keeps the explore and challenge steps — where writing your own prompt is the
 * whole task — from being overwritten when the participant steps away and back.
 */
export function promptsForUnitEntry(
    units: TutorialUnit[],
    unitIdx: number,
    current: { source: string; target: string },
): UnitPromptRestore | null {
    const unit = units[unitIdx];
    if (!unit) return null;

    const owned = new Set(promptsOwnedBy(unit));
    const otherUnits = new Set(units.filter((_, i) => i !== unitIdx).flatMap(promptsOwnedBy));
    // Replaceable: empty, or a prompt that some other unit put there and this one
    // doesn't also use.
    const replaceable = (value: string) => {
        const v = clean(value);
        return v === "" || (otherUnits.has(v) && !owned.has(v));
    };

    const wantSource = clean(unit.patchPair?.source) || clean(unit.prompts[0]);
    // A unit without a patch pair is a single-prompt step: it wants the target
    // box empty, so another unit's target left behind is cleared rather than kept.
    const wantTarget = clean(unit.patchPair?.target);

    const restore: UnitPromptRestore = {};
    if (wantSource && replaceable(current.source) && clean(current.source) !== wantSource) {
        restore.source = wantSource;
    }
    if (replaceable(current.target) && clean(current.target) !== wantTarget) {
        restore.target = wantTarget;
    }
    return restore.source === undefined && restore.target === undefined ? null : restore;
}
