import { describe, it, expect } from "bun:test";

import {
    getWorkshopSlugClaim,
    hasWorkshopClaim,
    normalizeWorkshopTools,
    workshopParticipant,
} from "@/lib/workshop";
import type { WorkshopTool } from "@/db/schema";

describe("normalizeWorkshopTools", () => {
    it("reads the legacy lens2 tool as logit-lens, keeping order", () => {
        expect(normalizeWorkshopTools(["lens2", "patch-lens"])).toEqual([
            "logit-lens",
            "patch-lens",
        ]);
    });

    it("leaves current and unknown tool names unchanged", () => {
        const tools = ["logit-lens", "activation-patching", "nope"];
        expect(normalizeWorkshopTools(tools)).toEqual(tools as WorkshopTool[]);
    });
});

describe("workshop participants", () => {
    it("are the users carrying a workshop claim", () => {
        const participant = { app_metadata: { workshop_slug: "abc123" } };
        expect(getWorkshopSlugClaim(participant)).toBe("abc123");
        expect(hasWorkshopClaim(participant)).toBe(true);
        for (const user of [
            null,
            undefined,
            { app_metadata: {} },
            { app_metadata: { workshop_slug: "" } },
        ]) {
            expect(hasWorkshopClaim(user)).toBe(false);
        }
    });

    it("are sent to their workshop workspace, or its join link until they have one", () => {
        expect(workshopParticipant("ws-1", "abc123")).toEqual({
            workspaceId: "ws-1",
            entryPath: "/workbench/ws-1",
        });
        expect(workshopParticipant(null, "abc123")).toEqual({
            workspaceId: null,
            entryPath: "/w/abc123",
        });
    });
});
