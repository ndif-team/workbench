import { describe, it, expect } from "bun:test";

import { normalizeWorkshopTools } from "@/lib/workshop";
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
