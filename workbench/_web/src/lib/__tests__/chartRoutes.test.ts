import { describe, it, expect } from "bun:test";

import { chartPath, toolChartPath, toolForRouteSegment } from "@/lib/chartRoutes";
import type { ToolType } from "@/types/charts";

describe("chart routes", () => {
    it("routes logit lens charts to /logit-lens/", () => {
        expect(chartPath("ws", "c1", "logit-lens")).toBe("/workbench/ws/logit-lens/c1");
        expect(toolChartPath("ws", "c1", "logit-lens")).toBe("/workbench/ws/logit-lens/c1");
    });

    it("routes the legacy lens2 type to /logit-lens/", () => {
        expect(chartPath("ws", "c1", "lens2")).toBe("/workbench/ws/logit-lens/c1");
        expect(toolChartPath("ws", "c1", "lens2" as ToolType)).toBe("/workbench/ws/logit-lens/c1");
    });

    it("opens the workspace root for retired or missing types", () => {
        expect(chartPath("ws", "c1", "lens")).toBe("/workbench/ws");
        expect(chartPath("ws", "c1", null)).toBe("/workbench/ws");
    });

    it("maps the logit-lens route segment back to its tool", () => {
        expect(toolForRouteSegment("logit-lens")).toBe("logit-lens");
        expect(toolForRouteSegment("j-lens")).toBe("jlens");
    });
});
