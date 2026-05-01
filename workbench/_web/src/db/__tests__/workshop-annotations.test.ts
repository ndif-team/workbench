/**
 * Integration tests for workshop annotations + workshop server actions.
 * Real SQLite, no mocks.
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { clearDatabase } from "../client";
import {
    upsertWorkshopAnnotation,
    getWorkshopAnnotation,
    getSessionAnnotations,
    deleteSessionAnnotations,
} from "@/lib/queries/workshopAnnotationQueries";

beforeEach(async () => {
    await clearDatabase();
});

describe("Workshop annotation queries", () => {
    it("inserts a fresh annotation when none exists for (sessionId, exampleId)", async () => {
        const row = await upsertWorkshopAnnotation({
            sessionId: "session-A",
            exampleId: "example-1",
            annotationText: "first thoughts",
        });

        expect(row.sessionId).toBe("session-A");
        expect(row.exampleId).toBe("example-1");
        expect(row.annotationText).toBe("first thoughts");
        expect(row.framingResponse).toBe("");
        expect(row.participantId).toBeNull();
    });

    it("upserts on the same (sessionId, exampleId) instead of duplicating", async () => {
        const first = await upsertWorkshopAnnotation({
            sessionId: "session-B",
            exampleId: "example-2",
            annotationText: "draft",
        });

        const second = await upsertWorkshopAnnotation({
            sessionId: "session-B",
            exampleId: "example-2",
            annotationText: "revised",
            framingResponse: "framing answer",
        });

        expect(second.id).toBe(first.id);
        expect(second.annotationText).toBe("revised");
        expect(second.framingResponse).toBe("framing answer");

        const all = await getSessionAnnotations("session-B");
        expect(all).toHaveLength(1);
    });

    it("preserves existing fields when upserting partial input", async () => {
        await upsertWorkshopAnnotation({
            sessionId: "session-C",
            exampleId: "example-3",
            annotationText: "keep me",
            framingResponse: "keep me too",
        });
        const updated = await upsertWorkshopAnnotation({
            sessionId: "session-C",
            exampleId: "example-3",
            framingResponse: "only this changes",
        });
        expect(updated.annotationText).toBe("keep me");
        expect(updated.framingResponse).toBe("only this changes");
    });

    it("isolates sessions from each other", async () => {
        await upsertWorkshopAnnotation({
            sessionId: "session-D",
            exampleId: "example-4",
            annotationText: "D's note",
        });
        await upsertWorkshopAnnotation({
            sessionId: "session-E",
            exampleId: "example-4",
            annotationText: "E's note",
        });

        const D = await getWorkshopAnnotation("session-D", "example-4");
        const E = await getWorkshopAnnotation("session-E", "example-4");
        expect(D!.annotationText).toBe("D's note");
        expect(E!.annotationText).toBe("E's note");
    });

    it("returns null for missing rows", async () => {
        const row = await getWorkshopAnnotation("ghost-session", "ghost-example");
        expect(row).toBeNull();
    });

    it("returns all rows for a session, oldest first", async () => {
        await upsertWorkshopAnnotation({
            sessionId: "session-F",
            exampleId: "task-1-ex-1",
            annotationText: "1",
        });
        await upsertWorkshopAnnotation({
            sessionId: "session-F",
            exampleId: "task-2-ex-1",
            annotationText: "2",
        });
        await upsertWorkshopAnnotation({
            sessionId: "session-F",
            exampleId: "task-3-ex-1",
            annotationText: "3",
        });

        const all = await getSessionAnnotations("session-F");
        expect(all).toHaveLength(3);
        expect(all.map((r) => r.annotationText)).toEqual(["1", "2", "3"]);
    });

    it("deletes all annotations for a session", async () => {
        await upsertWorkshopAnnotation({
            sessionId: "session-G",
            exampleId: "ex-a",
            annotationText: "a",
        });
        await upsertWorkshopAnnotation({
            sessionId: "session-G",
            exampleId: "ex-b",
            annotationText: "b",
        });

        await deleteSessionAnnotations("session-G");
        const all = await getSessionAnnotations("session-G");
        expect(all).toHaveLength(0);
    });

    it("accepts an optional participantId", async () => {
        const row = await upsertWorkshopAnnotation({
            sessionId: "session-H",
            exampleId: "ex-1",
            participantId: "faculty-001",
            annotationText: "hi",
        });
        expect(row.participantId).toBe("faculty-001");
    });
});

describe("Workshop server action — saveWorkshopAnnotation", () => {
    // These tests stub `next/headers` cookies so the server action runs
    // outside a Next.js request scope. Pattern: mock cookies() to back the
    // session-id by an in-memory map.
    it("creates a session id and round-trips a save+load", async () => {
        const cookieStore = new Map<string, { value: string }>();
        mock.module("next/headers", () => ({
            cookies: async () => ({
                get: (name: string) => cookieStore.get(name),
                set: (name: string, value: string) => {
                    cookieStore.set(name, { value });
                },
            }),
        }));

        const { saveWorkshopAnnotation, loadWorkshopAnnotation, loadSessionAnnotations } =
            await import("@/actions/workshop");

        const saved = await saveWorkshopAnnotation({
            exampleId: "branching_demo_fixture",
            annotationText: "I see it",
            framingResponse: "the model never paused",
        });
        expect(saved.annotationText).toBe("I see it");
        expect(saved.sessionId).toContain("wkshp-");

        const loaded = await loadWorkshopAnnotation("branching_demo_fixture");
        expect(loaded!.annotationText).toBe("I see it");
        expect(loaded!.framingResponse).toBe("the model never paused");

        const all = await loadSessionAnnotations();
        expect(all).toHaveLength(1);
    });
});
