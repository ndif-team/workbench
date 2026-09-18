/**
 * Joining a participant's saved reflections to the tutorial's units, for
 * display.
 *
 * The join is client-side on purpose: the panel already holds `units` (from
 * resolveTutorialForWorkspace, cached with staleTime Infinity), so doing it in
 * the server action would mean re-reading the tutorial row on every notes fetch
 * to produce titles the client is already holding. The read path stays a single
 * indexed query over tutorial_events.
 *
 * Pure — no DOM, no React — so it's directly unit-testable.
 */

import type { TutorialUnit } from "@/types/tutorial-content";
import type { TutorialNote } from "@/types/tutorialEvents";

export interface TutorialNoteView extends TutorialNote {
    /** The unit's title, or the raw step id if the content no longer has it. */
    stepTitle: string;
    /** 1-based position in the tutorial; null when the unit is gone. */
    stepNumber: number | null;
}

/**
 * Notes sorted into unit order, each labelled with its unit's number and title.
 *
 * A note whose step id is absent from `units` keeps its raw id as the title,
 * gets `stepNumber: null`, and sorts to the end in the order it was written
 * (`createdAt` tiebreak). Those are notes from a unit that was renamed or
 * removed since they were written — shown rather than silently dropped, because
 * the participant wrote them and a list that quietly loses entries is worse than
 * one with an unhelpful heading.
 *
 * Empty `units` (content not yet loaded) therefore renders every note with its
 * raw id and drops nothing.
 */
export const orderNotesByUnits = (
    notes: TutorialNote[],
    units: TutorialUnit[],
): TutorialNoteView[] => {
    const indexById = new Map<string, number>();
    units.forEach((u, i) => indexById.set(u.id, i));

    const ranked = notes.map((note) => {
        const idx = indexById.get(note.stepId);
        const unit = idx == null ? undefined : units[idx];
        return {
            // Unknown units rank after every known one, preserving write order
            // among themselves via the createdAt tiebreak below.
            rank: idx ?? Number.MAX_SAFE_INTEGER,
            view: {
                ...note,
                stepTitle: unit?.title ?? note.stepId,
                stepNumber: idx == null ? null : idx + 1,
            } satisfies TutorialNoteView,
        };
    });

    ranked.sort(
        (a, b) => a.rank - b.rank || a.view.createdAt.getTime() - b.view.createdAt.getTime(),
    );
    return ranked.map((r) => r.view);
};
