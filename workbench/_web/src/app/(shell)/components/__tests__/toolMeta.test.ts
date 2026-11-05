import { describe, it, expect } from "bun:test";

import { toolMeta } from "../toolMeta";

describe("toolMeta", () => {
    it("reads the legacy lens2 type as Logit Lens", () => {
        expect(toolMeta("logit-lens")!.label).toBe("Logit Lens");
        expect(toolMeta("lens2")).toBe(toolMeta("logit-lens")!);
    });

    it("returns undefined for retired and missing types", () => {
        expect(toolMeta("lens")).toBeUndefined();
        expect(toolMeta(null)).toBeUndefined();
    });
});
