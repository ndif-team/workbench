import { describe, it, expect } from "bun:test";

import { normalizeToolType, toolTypes } from "@/types/charts";

describe("normalizeToolType", () => {
    it("reads the legacy lens2 type as logit-lens", () => {
        expect(normalizeToolType("lens2")).toBe("logit-lens");
    });

    it("leaves current tool types unchanged", () => {
        for (const tool of toolTypes) {
            expect(normalizeToolType(tool)).toBe(tool);
        }
    });

    it("passes retired, unknown and missing types through", () => {
        expect(normalizeToolType("lens")).toBe("lens");
        expect(normalizeToolType("toString")).toBe("toString");
        expect(normalizeToolType(null)).toBeNull();
        expect(normalizeToolType(undefined)).toBeUndefined();
    });
});
