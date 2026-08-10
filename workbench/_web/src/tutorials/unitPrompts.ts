import type { TutorialUnit } from "@/types/tutorial-content";

/**
 * Prompt-box contents to apply when a participant arrives at a tutorial unit.
 * Only the boxes that need changing are present.
 */
export interface UnitPromptRestore {
    source?: string;
    target?: string;
}

// Defensive about type as well as absence: this runs from inside an effect, so a
// non-string prompt in authored content would throw there and take the whole chart
// page to the error boundary rather than just breaking the tutorial. Validation
// rejects such content (validateTutorialContent), but rows written before that
// guard existed are still out there.
const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

/** Every prompt string a unit claims: its bank plus its patch pair. */
const promptsOwnedBy = (unit: TutorialUnit): string[] =>
    [...(unit.prompts ?? []), unit.patchPair?.source, unit.patchPair?.target]
        .map(clean)
        .filter(Boolean);

/**
 * What to put in the prompt boxes when the participant arrives at `units[unitIdx]`.
 *
 * Navigating between units used to leave whatever was last run in the boxes, so a
 * revisited step showed instructions describing one prompt while the tool held
 * another — and a re-run there scored that step's check against the wrong prompt's
 * output. Restoring the step's own prompt makes the instructions and the screen
 * agree again.
 *
 * Three things are deliberately left where they are:
 *  - **Anything at all, on a step whose task is to write your own prompt**
 *    (`progression.on === "manual"` — explore, final challenge). Those steps own
 *    the box; a restore only fills it when it is empty. Everywhere else the step
 *    names the prompt its instructions and its check are about, so arriving there
 *    puts that prompt back even over text the participant typed — otherwise the
 *    instructions describe one prompt while the tool holds another, which is the
 *    whole failure this function exists to prevent.
 *  - **A prompt this unit extends.** A step whose task is "add to what's there and
 *    run it again" has the pre-append text in the box and the appended form in its
 *    bank; swapping one for the other would perform the task on arrival, before it
 *    had been read. A box holding a prefix of the wanted prompt is that signature.
 *  - **An alternate prompt from this unit's own bank**, on a single-prompt step —
 *    trying the second or third prompt in the bank is the step working as intended.
 *    A patch step is the exception: its pair is authoritative, since its bank lists
 *    both halves and the half in the wrong box is what needs correcting.
 */
export function promptsForUnitEntry(
    units: TutorialUnit[],
    unitIdx: number,
    current: { source: string; target: string },
): UnitPromptRestore | null {
    const unit = units[unitIdx];
    if (!unit) return null;

    const bank = (unit.prompts ?? []).map(clean).filter(Boolean);
    const pairSource = clean(unit.patchPair?.source);
    const pairTarget = clean(unit.patchPair?.target);

    const want = {
        source: pairSource || bank[0] || "",
        // A unit without a patch pair is a single-prompt step: it wants the target
        // box empty, so another unit's target left behind is cleared, not kept.
        target: pairTarget,
    };
    const keep = {
        source: new Set(pairSource ? [pairSource] : bank),
        target: new Set(pairTarget ? [pairTarget] : []),
    };
    // Anything some unit's content put in a box. What isn't here was typed.
    const authored = new Set(units.flatMap(promptsOwnedBy));
    // A step that asks the participant to write their own prompt doesn't get to
    // overwrite one.
    const boxIsTheirs = unit.progression?.on === "manual";

    const restore: UnitPromptRestore = {};
    for (const which of ["source", "target"] as const) {
        const wanted = want[which];
        const value = clean(current[which]);
        if (value === wanted) continue;
        if (value !== "") {
            if (keep[which].has(value)) continue;
            if (wanted.startsWith(value)) continue;
            if (boxIsTheirs && !authored.has(value)) continue;
        }
        restore[which] = wanted;
    }
    return restore.source === undefined && restore.target === undefined ? null : restore;
}
