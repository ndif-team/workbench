/**
 * Tests for Prolific study-param capture on workshop join.
 *
 * Two layers: the pure `parseProlificParams` extractor (no DB), and the
 * persistence path — `createWorkspace` storing params and
 * `setWorkspaceProlificIfEmpty`'s first-touch-wins backfill on re-join.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { clearDatabase } from "../client";
import { parseProlificParams } from "@/lib/prolific";
import {
    createWorkspace,
    getWorkspaceById,
    setWorkspaceProlificIfEmpty,
} from "@/lib/queries/workspaceQueries";
import { setDevUserId } from "@/lib/auth/devUser";

const USER = "anon-user-1";

describe("parseProlificParams", () => {
    it("extracts the canonical Prolific keys", () => {
        expect(
            parseProlificParams({
                PROLIFIC_PID: "pid-123",
                STUDY_ID: "study-456",
                SESSION_ID: "sess-789",
            }),
        ).toEqual({ prolificPid: "pid-123", studyId: "study-456", sessionId: "sess-789" });
    });

    it("returns null when no Prolific params are present", () => {
        expect(parseProlificParams({})).toBeNull();
        expect(parseProlificParams({ foo: "bar", ref: "twitter" })).toBeNull();
    });

    it("keeps whatever subset Prolific sends", () => {
        expect(parseProlificParams({ PROLIFIC_PID: "pid-only" })).toEqual({
            prolificPid: "pid-only",
        });
    });

    it("accepts lower_case keys defensively and takes the first repeated value", () => {
        expect(parseProlificParams({ prolific_pid: "lc" })).toEqual({ prolificPid: "lc" });
        expect(parseProlificParams({ PROLIFIC_PID: ["a", "b"] })).toEqual({ prolificPid: "a" });
    });

    it("ignores blank/whitespace-only values", () => {
        expect(parseProlificParams({ PROLIFIC_PID: "  ", STUDY_ID: "" })).toBeNull();
    });
});

describe("workspace Prolific persistence", () => {
    beforeEach(async () => {
        await clearDatabase();
        // getWorkspaceById is owner-scoped; act as the user these rows belong to.
        setDevUserId(USER);
    });

    it("stores Prolific params on the workspace at creation", async () => {
        const params = { prolificPid: "pid-1", studyId: "study-1", sessionId: "sess-1" };
        const ws = await createWorkspace("Faculty Pilot", undefined, params);

        const fetched = await getWorkspaceById(ws.id);
        expect(fetched!.prolific).toEqual(params);
    });

    it("defaults prolific to null when none are captured", async () => {
        const ws = await createWorkspace("Personal");
        const fetched = await getWorkspaceById(ws.id);
        expect(fetched!.prolific).toBeNull();
    });

    it("backfills params onto a workspace that has none", async () => {
        const ws = await createWorkspace("Joined without params");
        expect((await getWorkspaceById(ws.id))!.prolific).toBeNull();

        const params = { prolificPid: "late-pid" };
        await setWorkspaceProlificIfEmpty(ws.id, params);
        expect((await getWorkspaceById(ws.id))!.prolific).toEqual(params);
    });

    it("first-touch wins: backfill does not clobber existing params", async () => {
        const original = { prolificPid: "first", studyId: "study-1" };
        const ws = await createWorkspace("Faculty Pilot", undefined, original);

        await setWorkspaceProlificIfEmpty(ws.id, { prolificPid: "second" });
        expect((await getWorkspaceById(ws.id))!.prolific).toEqual(original);
    });

    it("rejects a non-owner backfilling Prolific params onto someone else's workspace", async () => {
        const ws = await createWorkspace("Victim");

        // A different caller must not be able to stamp attribution onto a
        // workspace they don't own — the ownership guard rejects it.
        setDevUserId("attacker-999");
        await expect(
            setWorkspaceProlificIfEmpty(ws.id, { prolificPid: "planted" }),
        ).rejects.toThrow("Workspace not found or access denied");

        setDevUserId(USER);
        expect((await getWorkspaceById(ws.id))!.prolific).toBeNull();
    });
});
