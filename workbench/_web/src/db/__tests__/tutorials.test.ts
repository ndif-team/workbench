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
import type { HintRung, TutorialContent, TutorialUnit, UnitCheck } from "@/types/tutorial-content";
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

    it("rejects a unit whose rendered fields aren't usable text", () => {
        const base = tinyContent().units[0];
        const withUnit = (overrides: Partial<TutorialUnit>) =>
            validateTutorialContent({ version: 1, units: [{ ...base, ...overrides }] });

        // `prompts` and `patchPair` are read by promptsForUnitEntry from inside an
        // effect, where a throw takes the whole chart page — not just the tutorial.
        expect(() => withUnit({ prompts: [{ text: "hi" } as never] })).toThrow();
        expect(() => withUnit({ task: { a: 1 } as never })).toThrow();
        expect(() => withUnit({ concept: [1] as never })).toThrow();
        expect(() => withUnit({ observationPrompt: 7 as never })).toThrow();
        expect(() => withUnit({ patchPair: { source: 5, target: null } as never })).toThrow();
        expect(() => withUnit({ patchPair: { source: "a", target: "" } })).toThrow();
        expect(() => withUnit({ faqs: [{ q: { x: 1 }, a: 2 }] as never })).toThrow();
        expect(() => withUnit({ title: "   " })).toThrow();
        // `why` is optional, but present-and-unrenderable is a blank callout at
        // best and a React "objects are not valid as a child" throw at worst.
        expect(() => withUnit({ why: "" })).toThrow();
        expect(() => withUnit({ why: { a: 1 } as never })).toThrow();
        expect(() => withUnit({ why: "Because it is how autocomplete works." })).not.toThrow();
        // …and accepts the same unit with all of them filled in properly.
        expect(() =>
            withUnit({
                prompts: ["The Eiffel Tower is in the city of"],
                patchPair: {
                    source: "The Eiffel Tower is in the city of",
                    target: "The Colosseum is in the city of",
                },
                faqs: [{ q: "Why?", a: "Because." }],
            }),
        ).not.toThrow();
    });

    it("accepts content using every optional feature", () => {
        // One place where the type, the validator and the panel have to agree; a
        // feature wired into two of the three shows up here.
        const content: TutorialContent = {
            version: 1,
            glossary: [{ term: "Cell", definition: "One square of the heatmap." }],
            units: [
                {
                    ...tinyContent().units[0],
                    kind: "patch",
                    progression: { on: "patch" },
                    patchPair: { source: "The Eiffel Tower is in", target: "The Colosseum is in" },
                    answerPlaceholder: "e.g. Paris",
                    observationPlaceholder: "What changed?",
                    faqs: [{ q: "What is a patch?", a: "Copying one cell into the other prompt." }],
                    check: {
                        question: "What does the target say now?",
                        kind: "choice",
                        options: ["Paris", "Rome"],
                        correctIndex: 0,
                    },
                    hints: [
                        {
                            stage: 1,
                            text: "Drag this onto that.",
                            spotlights: [
                                { grid: "source", layer: 20, position: 5 },
                                { grid: "target", layer: "last", position: "last" },
                            ],
                        },
                        { stage: 2, text: "Try the pair.", insertPrompt: "The Eiffel Tower is in" },
                    ],
                },
            ],
        };
        expect(() => validateTutorialContent(content)).not.toThrow();
    });

    // The welcome slideshow is modal and it is the first thing a participant sees,
    // so a slide that renders blank blocks the tutorial behind it rather than
    // degrading into something they can work around.
    it("rejects a welcome slideshow with nothing to show", () => {
        const withWelcome = (welcome: unknown) =>
            validateTutorialContent({
                ...tinyContent(),
                welcome: welcome as TutorialContent["welcome"],
            });

        expect(() => withWelcome({ slides: [] })).toThrow();
        expect(() => withWelcome({ slides: "nope" })).toThrow();
        expect(() => withWelcome({ slides: [{ body: "No title." }] })).toThrow();
        // A titled slide with neither body nor cards is an empty dialog page.
        expect(() => withWelcome({ slides: [{ title: "Empty" }] })).toThrow();
        expect(() => withWelcome({ slides: [{ title: "T", body: "   " }] })).toThrow();
        expect(() => withWelcome({ slides: [{ title: "T", body: { a: 1 } }] })).toThrow();
        expect(() => withWelcome({ slides: [{ title: "T", cards: [] }] })).toThrow();
        expect(() =>
            withWelcome({ slides: [{ title: "T", cards: [{ term: "Cell" }] }] }),
        ).toThrow();
        expect(() => withWelcome({ slides: [{ title: "T", body: "Hi." }], tourCta: "" })).toThrow();

        expect(() =>
            withWelcome({
                tourCta: "Show me around",
                slides: [
                    { title: "Welcome", body: "It predicts **one token** at a time." },
                    {
                        title: "Vocabulary",
                        cards: [{ term: "Cell", definition: "One square of the heatmap." }],
                    },
                ],
            }),
        ).not.toThrow();
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

    it("rejects text fields the panel would render as something other than text", () => {
        const base = tinyContent().units[0];
        const withCheck = (check: UnitCheck) =>
            validateTutorialContent({ version: 1, units: [{ ...base, check }] });

        // Authored JSON isn't typed: React throws on an object child, so these have
        // to fail here rather than in front of a participant.
        expect(() => withCheck({ question: "" as never, kind: "topToken" })).toThrow();
        expect(() => withCheck({ question: { text: "?" } as never, kind: "topToken" })).toThrow();
        expect(() =>
            withCheck({
                question: "?",
                kind: "choice",
                options: ["a", { label: "b" } as never],
                correctIndex: 0,
            }),
        ).toThrow();
        expect(() =>
            validateTutorialContent({
                ...tinyContent(),
                glossary: [{ term: 42 as never, definition: "A piece of text." }],
            }),
        ).toThrow();
    });

    // A unit-level spotlight is what the patch step's instructions point at, and
    // what forces a downsampled layer to render — a malformed one silently rings
    // nothing, leaving the task text describing cells that aren't marked.
    it("rejects a malformed unit spotlight", () => {
        const base = tinyContent().units[0];
        const withSpotlights = (spotlights: unknown) =>
            validateTutorialContent({
                version: 1,
                units: [{ ...base, spotlights: spotlights as TutorialUnit["spotlights"] }],
            });

        expect(() => withSpotlights([])).toThrow();
        expect(() => withSpotlights("source")).toThrow();
        expect(() => withSpotlights([{ grid: "nope", layer: 1, position: 1 }])).toThrow();
        expect(() => withSpotlights([{ grid: "source", layer: -1, position: 1 }])).toThrow();
        expect(() => withSpotlights([{ grid: "source", layer: 1.5, position: 1 }])).toThrow();
        expect(() => withSpotlights([{ grid: "source", position: 1 }])).toThrow();
        expect(() =>
            withSpotlights([
                { grid: "source", layer: 20, position: 5 },
                { grid: "target", layer: "last", position: "last" },
            ]),
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
        // Not cell indices. A negative layer would silently ring the first row —
        // the widget snaps a requested layer to the nearest rendered one.
        expect(() =>
            withHint({
                stage: 1,
                text: "here",
                spotlight: { grid: "source", layer: -1, position: 0 },
            }),
        ).toThrow();
        expect(() =>
            withHint({
                stage: 1,
                text: "here",
                spotlight: { grid: "source", layer: 2.5, position: 0 },
            }),
        ).toThrow();
        expect(() =>
            withHint({
                stage: 1,
                text: "here",
                spotlight: { grid: "source", layer: 0, position: 0 },
            }),
        ).not.toThrow();
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
