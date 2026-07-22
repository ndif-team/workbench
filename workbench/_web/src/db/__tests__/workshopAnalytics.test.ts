/**
 * Integration tests for the workshop-analytics rollups on SQLite.
 *
 * Exercises the unguarded internals in lib/queries/workshopAnalyticsDb.ts (the
 * requireAdmin-wrapped RPCs are thin guards over these). Seeds a workshop with
 * participant workspaces, lens_runs, and tutorial_events, then asserts the
 * totals, the active-vs-joined distinction, the tutorial funnel, day-bucketing,
 * and the CSV shape.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { clearDatabase } from "../client";
import {
    getWorkshopAnalytics,
    buildWorkshopCsv,
    bucketByDay,
} from "@/lib/queries/workshopAnalyticsDb";
import { tutorialCompletionPct } from "@/lib/workshopCompletion";
import { createWorkshop } from "@/lib/queries/workshopDb";
import { createWorkspace } from "@/lib/queries/workspaceQueries";
import { createLensRun } from "@/lib/queries/lensRunQueries";
import { insertTutorialEvent } from "@/lib/queries/tutorialEventsDb";
import type { WorkshopTool } from "@/db/schema";
import type { LensRunSummary, LensRunHeatmaps } from "@/types/lensRun";
import { TUTORIAL_STEP_ORDER } from "@/tutorials/prolificSteps";

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

// Minimal well-formed lens_runs payloads (see lensRuns.test.ts).
const summary = (): LensRunSummary =>
    ({
        source: {
            prompt: "The Eiffel Tower is in",
            finalToken: " Paris",
            lastRow: { layers: [0], cells: [{ token: " Paris", prob: 0.9 }] },
        },
        params: { topk: 10, includeEntropy: true },
    }) as unknown as LensRunSummary;
const heatmaps = (): LensRunHeatmaps => ({}) as unknown as LensRunHeatmaps;

const seedRun = (workspaceId: string, chartId: string, model: string) =>
    createLensRun({ workspaceId, chartId, model, summary: summary(), heatmaps: heatmaps() });

describe("workshop analytics", () => {
    beforeEach(async () => {
        await clearDatabase();
    });

    it("returns empty analytics for a workshop with no participants", async () => {
        const workshop = await createWorkshop(workshopInput());
        const a = await getWorkshopAnalytics(workshop.id, TUTORIAL_STEP_ORDER);
        expect(a.totals.participants).toBe(0);
        expect(a.participants).toEqual([]);
        expect(a.series.joinsPerDay).toEqual([]);
    });

    it("distinguishes joined from active and rolls up runs, models, prolific", async () => {
        const workshop = await createWorkshop(workshopInput());
        const ws1 = await createWorkspace("user-1111", "S1", workshop.id, {
            prolificPid: "PID-1",
            studyId: "STUDY",
            sessionId: "SESS",
        });
        const ws2 = await createWorkspace("user-2222", "S2", workshop.id);
        // ws3 joins but never runs anything (inactive).
        await createWorkspace("user-3333", "S3", workshop.id);

        await seedRun(ws1.id, "chart-1", "meta-llama/Llama-3.1-8B");
        await seedRun(ws1.id, "chart-1", "gpt2");
        await seedRun(ws2.id, "chart-2", "meta-llama/Llama-3.1-8B");

        const a = await getWorkshopAnalytics(workshop.id, TUTORIAL_STEP_ORDER);

        expect(a.totals.participants).toBe(3);
        expect(a.totals.activeParticipants).toBe(2); // ws1, ws2
        expect(a.totals.lensRuns).toBe(3);
        expect(a.totals.prolificAttributed).toBe(1);

        const p1 = a.participants.find((p) => p.workspaceId === ws1.id)!;
        expect(p1.lensRuns).toBe(2);
        expect(p1.modelsUsed).toEqual(["gpt2", "meta-llama/Llama-3.1-8B"]);
        expect(p1.prolificPid).toBe("PID-1");
        expect(p1.userIdShort).toBe("user-111"); // first 8 chars

        const p3 = a.participants.find((p) => p.userIdShort === "user-333")!;
        expect(p3.lensRuns).toBe(0);
    });

    it("derives the tutorial funnel and per-participant progress", async () => {
        const workshop = await createWorkshop(workshopInput());
        const ws1 = await createWorkspace("user-1111", "S1", workshop.id);
        const ws2 = await createWorkspace("user-2222", "S2", workshop.id);

        for (const step of ["u0-orientation", "u1-answers"]) {
            await insertTutorialEvent({
                workspaceId: ws1.id,
                stepId: step,
                eventType: "step_started",
            });
            await insertTutorialEvent({
                workspaceId: ws1.id,
                stepId: step,
                eventType: "step_completed",
            });
        }
        await insertTutorialEvent({
            workspaceId: ws2.id,
            stepId: "u0-orientation",
            eventType: "step_started",
        });
        await insertTutorialEvent({
            workspaceId: ws1.id,
            stepId: "u1-answers",
            eventType: "hint_shown",
            payload: { hintStage: 1 },
        });

        const a = await getWorkshopAnalytics(workshop.id, TUTORIAL_STEP_ORDER);
        const u0 = a.tutorial.funnel.find((f) => f.stepId === "u0-orientation")!;
        expect(u0.started).toBe(2);
        expect(u0.completed).toBe(1);

        const p1 = a.participants.find((p) => p.workspaceId === ws1.id)!;
        expect(p1.furthestStepId).toBe("u1-answers");
        expect(p1.hintsUsed).toBe(1);

        // The canonical final unit is surfaced even though nobody reached it, so
        // the completion KPI divides by it (0 completions) rather than by the
        // furthest step actually reached (u1) — no inflated completion %.
        expect(a.tutorial.finalStepId).toBe("u6-challenge");
        expect(a.tutorial.funnel.find((f) => f.stepId === "u6-challenge")).toBeUndefined();
    });

    it("completion % divides by the canonical first unit, not the first observed row", async () => {
        const workshop = await createWorkshop(workshopInput());
        // Two participants whose telemetry MISSES the canonical first unit (u0):
        // both start u1 and complete the final unit. The naive denominator
        // (funnel[0] = u1) would read 100% completion; the canonical first unit
        // (u0) has no starts, so the truthful KPI is 0%.
        for (const uid of ["user-1111", "user-2222"]) {
            const ws = await createWorkspace(uid, uid, workshop.id);
            await insertTutorialEvent({
                workspaceId: ws.id,
                stepId: "u1-answers",
                eventType: "step_started",
            });
            await insertTutorialEvent({
                workspaceId: ws.id,
                stepId: "u6-challenge",
                eventType: "step_completed",
            });
        }

        const a = await getWorkshopAnalytics(workshop.id, TUTORIAL_STEP_ORDER);
        expect(a.tutorial.firstStepId).toBe("u0-orientation");
        expect(a.tutorial.funnel[0].stepId).toBe("u1-answers"); // u0 dropped (no events)
        // Canonical first unit had 0 starts → 0%, not 100% off the u1 cohort.
        expect(tutorialCompletionPct(a)).toBe(0);
    });

    it("emits a two-section CSV (participants + observations) with a header", async () => {
        const workshop = await createWorkshop(workshopInput());
        const ws = await createWorkspace("user-1111", "S1", workshop.id);
        await seedRun(ws.id, "chart-1", "gpt2");
        await insertTutorialEvent({
            workspaceId: ws.id,
            stepId: "u6-challenge",
            eventType: "observation_submitted",
            payload: { observationText: "It said 5+5 = 11, with commas, and was sure." },
        });

        const a = await getWorkshopAnalytics(workshop.id, TUTORIAL_STEP_ORDER);
        const csv = buildWorkshopCsv(a);
        const lines = csv.split("\n");
        expect(lines[0]).toContain("record_type");
        expect(lines.some((l) => l.startsWith("participant,"))).toBe(true);
        expect(lines.some((l) => l.startsWith("observation,"))).toBe(true);
        // Comma-bearing observation text must be quoted, not split into columns.
        expect(csv).toContain('"It said 5+5 = 11, with commas, and was sure."');
    });

    it("surfaces embedded-check answers, per-step pass rates, and CSV check rows", async () => {
        const workshop = await createWorkshop(workshopInput());
        const ws1 = await createWorkspace("user-1111", "S1", workshop.id, {
            prolificPid: "PID-1",
            studyId: "STUDY-1",
            sessionId: "SESS-1",
        });
        const ws2 = await createWorkspace("user-2222", "S2", workshop.id);

        await insertTutorialEvent({
            workspaceId: ws1.id,
            stepId: "u0-orientation",
            eventType: "check_answered",
            payload: { answer: "Paris", correct: true },
        });
        await insertTutorialEvent({
            workspaceId: ws2.id,
            stepId: "u0-orientation",
            eventType: "check_answered",
            payload: { answer: "London", correct: false },
        });

        const a = await getWorkshopAnalytics(workshop.id, TUTORIAL_STEP_ORDER);
        expect(a.tutorial.checks.length).toBe(2);
        const u0 = a.tutorial.checkStats.find((c) => c.stepId === "u0-orientation")!;
        expect(u0.answered).toBe(2);
        expect(u0.correct).toBe(1);

        const csv = buildWorkshopCsv(a);
        const lines = csv.split("\n");
        expect(lines[0]).toContain("study_id");
        expect(lines[0]).toContain("session_id");
        // The Prolific triple rides the participant row so checks join on it.
        expect(lines.some((l) => l.startsWith("participant,") && l.includes("STUDY-1"))).toBe(true);
        expect(lines.some((l) => l.startsWith("check,") && l.includes("Paris"))).toBe(true);
    });

    it("neutralizes spreadsheet formula injection in observation text", async () => {
        const workshop = await createWorkshop(workshopInput());
        const ws = await createWorkspace("user-1111", "S1", workshop.id);
        await insertTutorialEvent({
            workspaceId: ws.id,
            stepId: "u6-challenge",
            eventType: "observation_submitted",
            payload: { observationText: '=HYPERLINK("http://evil")' },
        });

        const a = await getWorkshopAnalytics(workshop.id, TUTORIAL_STEP_ORDER);
        const csv = buildWorkshopCsv(a);
        // The formula-leading cell is prefixed with a single quote and quoted
        // (it also contains a comma), so a spreadsheet renders it as literal text.
        expect(csv).toContain("\"'=HYPERLINK");
        expect(csv).not.toMatch(/,=HYPERLINK/);
    });

    it("buckets timestamps into sorted UTC day counts", () => {
        const buckets = bucketByDay([
            new Date("2026-07-16T10:00:00Z"),
            new Date("2026-07-16T23:00:00Z"),
            new Date("2026-07-14T01:00:00Z"),
        ]);
        expect(buckets).toEqual([
            { date: "2026-07-14", count: 1 },
            { date: "2026-07-16", count: 2 },
        ]);
    });
});
