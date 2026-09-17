/**
 * Integration tests for the tutorial_events entity on SQLite.
 *
 * Exercises the unguarded internals in lib/queries/tutorialEventsDb.ts (the
 * recordTutorialEvent RPC in tutorialEventsQueries.ts is a thin unguarded write
 * over insertTutorialEvent). Covers the insert round-trip, the per-workspace
 * timeline, the workshop-scoped join through workspaces.workshop_id, and the
 * pure TS aggregators the analytics dashboard derives (funnel, observations,
 * per-participant progress).
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { clearDatabase } from "../client";
import {
    insertTutorialEvent,
    getTutorialEventsForWorkspace,
    getTutorialEventsForWorkshop,
    deriveFunnel,
    deriveObservations,
    deriveProgressByWorkspace,
    deriveLatestNotes,
} from "@/lib/queries/tutorialEventsDb";
import { getTutorialNotesForWorkspace } from "@/lib/queries/tutorialEventsQueries";
import { createWorkshop } from "@/lib/queries/workshopDb";
import { createWorkspace } from "@/lib/queries/workspaceQueries";
import type { WorkshopTool } from "@/db/schema";

const workshopInput = (overrides = {}) => ({
    name: "Faculty Pilot",
    allowedTools: ["patch-lens"] as WorkshopTool[],
    model: "meta-llama/Llama-3.1-8B",
    starterPrompt: "The Eiffel Tower is in",
    allowModelChange: false,
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    createdBy: "admin@example.edu",
    ...overrides,
});

// Canonical unit order used by the funnel / furthest-step derivation.
const STEP_ORDER = ["u0-orientation", "u1-answers", "u2-knows", "u3-patterns"] as const;

describe("tutorial_events", () => {
    beforeEach(async () => {
        await clearDatabase();
    });

    it("inserts an event and reads the workspace timeline back in order", async () => {
        const workshop = await createWorkshop(workshopInput());
        const ws = await createWorkspace("u1", "Session", workshop.id);

        await insertTutorialEvent({
            workspaceId: ws.id,
            stepId: "u0-orientation",
            eventType: "step_started",
        });
        await insertTutorialEvent({
            workspaceId: ws.id,
            stepId: "u0-orientation",
            eventType: "step_completed",
        });
        await insertTutorialEvent({
            workspaceId: ws.id,
            stepId: "u1-answers",
            eventType: "hint_shown",
            payload: { hintStage: 1 },
        });

        const events = await getTutorialEventsForWorkspace(ws.id);
        expect(events.length).toBe(3);
        // Assert membership, not exact sequence: rapid inserts can share a
        // millisecond (createdAt is timestamp_ms), so the (createdAt, id)
        // tiebreak is nondeterministic within a burst — and intra-ms order isn't
        // load-bearing (analytics derivations aggregate, they don't read order).
        expect(events.map((e) => e.eventType).sort()).toEqual(
            ["hint_shown", "step_completed", "step_started"].sort(),
        );
        const hint = events.find((e) => e.eventType === "hint_shown");
        expect(hint?.payload?.hintStage).toBe(1);
    });

    it("scopes events to a workshop through workspaces.workshop_id", async () => {
        const a = await createWorkshop(workshopInput({ name: "A" }));
        const b = await createWorkshop(workshopInput({ name: "B" }));
        const wsA = await createWorkspace("u1", "A ws", a.id);
        const wsB = await createWorkspace("u2", "B ws", b.id);

        await insertTutorialEvent({
            workspaceId: wsA.id,
            stepId: "u0-orientation",
            eventType: "step_started",
        });
        await insertTutorialEvent({
            workspaceId: wsB.id,
            stepId: "u0-orientation",
            eventType: "step_started",
        });

        const eventsA = await getTutorialEventsForWorkshop(a.id);
        expect(eventsA.length).toBe(1);
        expect(eventsA[0].workspaceId).toBe(wsA.id);
    });

    it("derives a started→completed funnel, counting each workspace once per step", async () => {
        const workshop = await createWorkshop(workshopInput());
        const ws1 = await createWorkspace("u1", "S1", workshop.id);
        const ws2 = await createWorkspace("u2", "S2", workshop.id);

        // ws1 completes u0 then starts u1; ws2 only starts u0 (and reruns it).
        await insertTutorialEvent({
            workspaceId: ws1.id,
            stepId: "u0-orientation",
            eventType: "step_started",
        });
        await insertTutorialEvent({
            workspaceId: ws1.id,
            stepId: "u0-orientation",
            eventType: "step_completed",
        });
        await insertTutorialEvent({
            workspaceId: ws1.id,
            stepId: "u1-answers",
            eventType: "step_started",
        });
        await insertTutorialEvent({
            workspaceId: ws2.id,
            stepId: "u0-orientation",
            eventType: "step_started",
        });
        await insertTutorialEvent({
            workspaceId: ws2.id,
            stepId: "u0-orientation",
            eventType: "step_started",
        });

        const funnel = deriveFunnel(await getTutorialEventsForWorkshop(workshop.id), STEP_ORDER);
        const u0 = funnel.find((f) => f.stepId === "u0-orientation")!;
        const u1 = funnel.find((f) => f.stepId === "u1-answers")!;
        expect(u0.started).toBe(2); // both, deduped despite ws2's rerun
        expect(u0.completed).toBe(1); // only ws1
        expect(u1.started).toBe(1);
        expect(u1.completed).toBe(0);
        // Ordered by the canonical step order.
        expect(funnel.map((f) => f.stepId)).toEqual(["u0-orientation", "u1-answers"]);
    });

    it("flattens observation submissions with their text", async () => {
        const workshop = await createWorkshop(workshopInput());
        const ws = await createWorkspace("u1", "S", workshop.id);
        await insertTutorialEvent({
            workspaceId: ws.id,
            stepId: "u6-challenge",
            eventType: "observation_submitted",
            payload: { observationText: "The model was confidently wrong about 5+5." },
        });

        const obs = deriveObservations(await getTutorialEventsForWorkshop(workshop.id));
        expect(obs.length).toBe(1);
        expect(obs[0].stepId).toBe("u6-challenge");
        expect(obs[0].text).toContain("confidently wrong");
    });

    it("derives per-workspace progress: furthest step + hint count", async () => {
        const workshop = await createWorkshop(workshopInput());
        const ws = await createWorkspace("u1", "S", workshop.id);
        await insertTutorialEvent({
            workspaceId: ws.id,
            stepId: "u0-orientation",
            eventType: "step_completed",
        });
        await insertTutorialEvent({
            workspaceId: ws.id,
            stepId: "u2-knows",
            eventType: "step_completed",
        });
        await insertTutorialEvent({
            workspaceId: ws.id,
            stepId: "u1-answers",
            eventType: "hint_shown",
            payload: { hintStage: 1 },
        });
        await insertTutorialEvent({
            workspaceId: ws.id,
            stepId: "u1-answers",
            eventType: "hint_shown",
            payload: { hintStage: 2 },
        });

        const progress = deriveProgressByWorkspace(
            await getTutorialEventsForWorkshop(workshop.id),
            STEP_ORDER,
        );
        expect(progress[ws.id].furthestStepId).toBe("u2-knows"); // furthest by canonical order
        expect(progress[ws.id].completedStepIds.sort()).toEqual(["u0-orientation", "u2-knows"]);
        expect(progress[ws.id].hintsUsed).toBe(2);
    });

    // The orientation walkthrough records its own `tour-`-prefixed steps so its
    // drop-off is measurable, but progress means *units*: an unranked id used to
    // win the furthest-step comparison (rank -1 against an initial best of -1).
    it("ignores step ids outside the canonical order when deriving progress", async () => {
        const workshop = await createWorkshop(workshopInput());
        const ws = await createWorkspace("u-tour", "S", workshop.id);
        for (const stepId of ["tour-prompt", "tour-run", "tour-glossary"]) {
            await insertTutorialEvent({ workspaceId: ws.id, stepId, eventType: "step_completed" });
        }

        const events = await getTutorialEventsForWorkshop(workshop.id);
        const tourOnly = deriveProgressByWorkspace(events, STEP_ORDER);
        expect(tourOnly[ws.id].furthestStepId).toBeNull();
        expect(tourOnly[ws.id].completedStepIds).toEqual([]);

        // …and a real unit completed after the tour still counts.
        await insertTutorialEvent({
            workspaceId: ws.id,
            stepId: "u0-orientation",
            eventType: "step_completed",
        });
        const withUnit = deriveProgressByWorkspace(
            await getTutorialEventsForWorkshop(workshop.id),
            STEP_ORDER,
        );
        expect(withUnit[ws.id].furthestStepId).toBe("u0-orientation");
        expect(withUnit[ws.id].completedStepIds).toEqual(["u0-orientation"]);
    });
});

/**
 * The participant-facing read side of `observation_submitted`: the "Your notes"
 * popover and the completion recap. The text is written on every save already —
 * until this wave the only read path was the admin analytics dashboard.
 */
describe("participant notes", () => {
    beforeEach(async () => {
        await clearDatabase();
    });

    const note = (workspaceId: string, stepId: string, observationText: string) =>
        insertTutorialEvent({
            workspaceId,
            stepId,
            eventType: "observation_submitted",
            payload: { observationText },
        });

    it("keeps the latest note per step, in the order the steps were first written about", async () => {
        const workshop = await createWorkshop(workshopInput());
        const ws = await createWorkspace("u1", "S", workshop.id);

        await note(ws.id, "u0-orientation", "first");
        await note(ws.id, "u1-answers", "about the runner-up");
        await note(ws.id, "u0-orientation", "revised");

        const notes = await getTutorialNotesForWorkspace(ws.id);
        expect(notes.length).toBe(2);
        // The rewrite replaces the text but not the note's place in the list —
        // a note that jumped to the bottom on every edit would read as new.
        expect(notes.map((n) => n.stepId)).toEqual(["u0-orientation", "u1-answers"]);
        expect(notes[0].text).toBe("revised");
        expect(notes[1].text).toBe("about the runner-up");
    });

    it("ignores other event types and blank submissions", async () => {
        const workshop = await createWorkshop(workshopInput());
        const ws = await createWorkspace("u1", "S", workshop.id);

        await insertTutorialEvent({
            workspaceId: ws.id,
            stepId: "u0-orientation",
            eventType: "step_started",
        });
        await insertTutorialEvent({
            workspaceId: ws.id,
            stepId: "u0-orientation",
            eventType: "check_answered",
            payload: { answer: "Paris", correct: true },
        });
        await note(ws.id, "u0-orientation", "a real note");
        // The panel saves on blur as well as on submit, so an emptied textarea
        // arrives as a whitespace-only write. It must not erase what is there.
        await note(ws.id, "u0-orientation", "   ");
        await note(ws.id, "u1-answers", "");

        const notes = await getTutorialNotesForWorkspace(ws.id);
        expect(notes.length).toBe(1);
        expect(notes[0]).toMatchObject({ stepId: "u0-orientation", text: "a real note" });
    });

    // The test that pins the trust boundary. The action is unguarded by design —
    // the capability is holding the workspace id — so the one thing it must
    // never do is widen to the workshop. Two participants in the same room share
    // a workshop, and one of them must not be able to read the other's
    // reflections.
    it("returns only the notes belonging to the workspace asked for", async () => {
        const workshop = await createWorkshop(workshopInput());
        const a = await createWorkspace("u-a", "A", workshop.id);
        const b = await createWorkspace("u-b", "B", workshop.id);

        await note(a.id, "u0-orientation", "A's reflection");
        await note(b.id, "u0-orientation", "B's reflection");

        const notesA = await getTutorialNotesForWorkspace(a.id);
        expect(notesA.length).toBe(1);
        expect(notesA[0].text).toBe("A's reflection");

        const notesB = await getTutorialNotesForWorkspace(b.id);
        expect(notesB.map((n) => n.text)).toEqual(["B's reflection"]);
    });

    it("has nothing to show for a workspace with no notes, or no id at all", async () => {
        const workshop = await createWorkshop(workshopInput());
        const ws = await createWorkspace("u1", "S", workshop.id);
        expect(await getTutorialNotesForWorkspace(ws.id)).toEqual([]);
        // The panel renders before the workspace id is resolved from the route.
        expect(await getTutorialNotesForWorkspace("")).toEqual([]);
        expect(await getTutorialNotesForWorkspace("not-a-workspace")).toEqual([]);
    });

    it("returns the text trimmed, and carries the step id the note was filed under", async () => {
        const workshop = await createWorkshop(workshopInput());
        const ws = await createWorkspace("u1", "S", workshop.id);
        await note(ws.id, "u2-knows", "  it made something up  \n");

        const notes = await getTutorialNotesForWorkspace(ws.id);
        expect(notes[0].text).toBe("it made something up");
        // A stable unit id, not an array index: content edited between sessions
        // cannot silently re-attach a note to a different step.
        expect(notes[0].stepId).toBe("u2-knows");
        expect(notes[0].createdAt).toBeInstanceOf(Date);
    });

    it("derives the same notes from a timeline already in hand", async () => {
        // The action is `getTutorialEventsForWorkspace` + `deriveLatestNotes`;
        // the derivation is pure so the panel can seed its cache at save time
        // without waiting for a round trip.
        const workshop = await createWorkshop(workshopInput());
        const ws = await createWorkspace("u1", "S", workshop.id);
        await note(ws.id, "u0-orientation", "first");
        await note(ws.id, "u0-orientation", "revised");

        const derived = deriveLatestNotes(await getTutorialEventsForWorkspace(ws.id));
        expect(derived).toEqual(await getTutorialNotesForWorkspace(ws.id));
        expect(derived.map((n) => n.text)).toEqual(["revised"]);
    });
});
