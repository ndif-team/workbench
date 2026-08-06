/**
 * Integration tests for DB-backed tutorial content on SQLite.
 *
 * Exercises the unguarded internals in lib/queries/tutorialContentDb.ts: the
 * seed helper, CRUD, content validation, and the participant resolve path
 * (workspace → workshop → tutorial, falling back to the seed demo).
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { clearDatabase } from "../client";
import {
    ensureSeedTutorial,
    createTutorial,
    getTutorialById,
    listTutorials,
    updateTutorial,
    deleteTutorial,
    resolveTutorialForWorkspace,
    getTutorialStepOrderForWorkshop,
    validateTutorialContent,
} from "@/lib/queries/tutorialContentDb";
import { createWorkshop, getWorkshopById } from "@/lib/queries/workshopDb";
import { createWorkspace } from "@/lib/queries/workspaceQueries";
import { PROLIFIC_TUTORIAL_SEED, PROLIFIC_TUTORIAL_SLUG } from "@/tutorials/prolificSeed";
import type { HintRung, TutorialContent, UnitCheck } from "@/types/tutorial-content";
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

const tinyContent = (id = "s0"): TutorialContent => ({
    version: 1,
    units: [
        {
            id,
            kind: "lens",
            title: "Only step",
            task: "Run it.",
            concept: "A concept.",
            prompts: ["Paris is the capital of"],
            hints: [],
            observationPrompt: "What happened?",
            progression: { on: "run", successPredicate: { kind: "always" } },
        },
    ],
});

describe("tutorial content", () => {
    beforeEach(async () => {
        await clearDatabase();
    });

    it("seeds the demo tutorial idempotently", async () => {
        const a = await ensureSeedTutorial();
        const b = await ensureSeedTutorial();
        expect(a.id).toBe(b.id);
        expect(a.slug).toBe(PROLIFIC_TUTORIAL_SLUG);
        expect(a.data.units.length).toBe(PROLIFIC_TUTORIAL_SEED.units.length);
        expect((await listTutorials()).length).toBe(1);
    });

    it("creates, reads, updates, and deletes a tutorial", async () => {
        const created = await createTutorial({ name: "Custom", data: tinyContent() });
        expect((await getTutorialById(created.id))?.name).toBe("Custom");

        const updated = await updateTutorial(created.id, { name: "Renamed" });
        expect(updated.name).toBe("Renamed");

        await deleteTutorial(created.id);
        expect(await getTutorialById(created.id)).toBeNull();
    });

    it("rejects empty or duplicate-id content", () => {
        expect(() => validateTutorialContent({ version: 1, units: [] })).toThrow();
        const dup: TutorialContent = {
            version: 1,
            units: [...tinyContent("dup").units, ...tinyContent("dup").units],
        };
        expect(() => validateTutorialContent(dup)).toThrow();
    });

    it("resolves a workshop's assigned tutorial, else the demo seed", async () => {
        const custom = await createTutorial({ name: "Custom", data: tinyContent("only") });
        const withTutorial = await createWorkshop(workshopInput({ tutorialId: custom.id }));
        const withoutTutorial = await createWorkshop(workshopInput({ name: "No tutorial" }));

        const wsA = await createWorkspace("user-a", "A", withTutorial.id);
        const wsB = await createWorkspace("user-b", "B", withoutTutorial.id);

        const resolvedA = await resolveTutorialForWorkspace(wsA.id);
        expect(resolvedA.units[0].id).toBe("only");

        // Falls back to the in-code seed constant when the demo row is absent.
        const resolvedB = await resolveTutorialForWorkspace(wsB.id);
        expect(resolvedB.units.length).toBe(PROLIFIC_TUTORIAL_SEED.units.length);
    });

    it("nulls a workshop's tutorial pointer when the tutorial is deleted", async () => {
        const custom = await createTutorial({ name: "Custom", data: tinyContent() });
        const workshop = await createWorkshop(workshopInput({ tutorialId: custom.id }));
        await deleteTutorial(custom.id);
        expect((await getWorkshopById(workshop.id))?.tutorialId ?? null).toBeNull();
    });

    it("derives the analytics step order from the workshop's assigned tutorial", async () => {
        const custom = await createTutorial({ name: "Custom", data: tinyContent("only") });
        const withTutorial = await createWorkshop(workshopInput({ tutorialId: custom.id }));
        const withoutTutorial = await createWorkshop(workshopInput({ name: "No tutorial" }));

        // Custom tutorial → its own unit ids (not the demo's canonical order).
        expect(await getTutorialStepOrderForWorkshop(withTutorial.id)).toEqual(["only"]);
        // No assigned tutorial → falls back to the seed demo's unit ids.
        expect(await getTutorialStepOrderForWorkshop(withoutTutorial.id)).toEqual(
            PROLIFIC_TUTORIAL_SEED.units.map((u) => u.id),
        );
    });

    it("rejects units missing prompts/hints/progression or with an over-long id", () => {
        const base = tinyContent().units[0];
        // Missing hints array → would crash the participant panel.
        expect(() =>
            validateTutorialContent({
                version: 1,
                units: [{ ...base, hints: undefined as never }],
            }),
        ).toThrow();
        // Over-long id → tutorial_events.stepId (varchar(64)) would drop events.
        expect(() =>
            validateTutorialContent({
                version: 1,
                units: [{ ...base, id: "x".repeat(65) }],
            }),
        ).toThrow();
        // Unsupported check kind → would silently mis-score. (Authored JSON
        // bypasses the TS types, hence the cast.)
        expect(() =>
            validateTutorialContent({
                version: 1,
                units: [{ ...base, check: { question: "?", kind: "layerBand" as never } }],
            }),
        ).toThrow();
    });

    it("rejects a choice check with no usable answer key", () => {
        const base = tinyContent().units[0];
        const withCheck = (check: UnitCheck) =>
            validateTutorialContent({ version: 1, units: [{ ...base, check }] });

        // Fewer than two options, or an empty one: nothing to choose between.
        expect(() =>
            withCheck({ question: "?", kind: "choice", options: ["only"], correctIndex: 0 }),
        ).toThrow();
        expect(() =>
            withCheck({ question: "?", kind: "choice", options: ["a", ""], correctIndex: 0 }),
        ).toThrow();
        // correctIndex outside the options → every participant scored wrong.
        expect(() =>
            withCheck({ question: "?", kind: "choice", options: ["a", "b"], correctIndex: 2 }),
        ).toThrow();
        expect(() =>
            withCheck({ question: "?", kind: "choice", options: ["a", "b"], correctIndex: 1 }),
        ).not.toThrow();
    });

    it("rejects a malformed hint spotlight", () => {
        const base = tinyContent().units[0];
        const withHint = (hint: HintRung) =>
            validateTutorialContent({ version: 1, units: [{ ...base, hints: [hint] }] });

        expect(() =>
            withHint({
                stage: 1,
                text: "look here",
                spotlight: { grid: "nowhere" as never, layer: 1, position: 1 },
            }),
        ).toThrow();
        // A rung may light several cells — both ends of a patch drag.
        expect(() =>
            withHint({
                stage: 1,
                text: "drag this onto that",
                spotlights: [
                    { grid: "source", layer: 20, position: 5 },
                    { grid: "target", layer: "last", position: "last" },
                ],
            }),
        ).not.toThrow();
        expect(() =>
            withHint({
                stage: 1,
                text: "drag this onto that",
                spotlights: [{ grid: "target", layer: 20, position: null as never }],
            }),
        ).toThrow();
    });

    it("rejects a glossary entry missing its term or definition", () => {
        const content = tinyContent();
        expect(() =>
            validateTutorialContent({
                ...content,
                glossary: [{ term: "Token", definition: "" }],
            }),
        ).toThrow();
        expect(() =>
            validateTutorialContent({
                ...content,
                glossary: [{ term: "Token", definition: "A piece of text." }],
            }),
        ).not.toThrow();
    });
});
