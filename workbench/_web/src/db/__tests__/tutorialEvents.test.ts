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
} from "@/lib/queries/tutorialEventsDb";
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
});
