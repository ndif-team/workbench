import { describe, it, expect } from "bun:test";

import {
    chartPath,
    openWorkspacePath,
    reportPath,
    toolChartPath,
    toolForRouteSegment,
    workspacePath,
} from "@/lib/chartRoutes";
import type { ToolType } from "@/types/charts";

describe("chart routes", () => {
    it("routes each live tool to its chart page, without the workspace", () => {
        expect(chartPath("c1", "logit-lens")).toBe("/logit-lens/c1");
        expect(toolChartPath("c1", "logit-lens")).toBe("/logit-lens/c1");
        expect(chartPath("c1", "jlens", "ws")).toBe("/j-lens/c1");
        expect(chartPath("c1", "activation-patching")).toBe("/activation-patching/c1");
        expect(chartPath("c1", "patch-lens")).toBe("/patch-lens/c1");
    });

    it("routes the legacy lens2 type to /logit-lens/", () => {
        expect(chartPath("c1", "lens2")).toBe("/logit-lens/c1");
        expect(toolChartPath("c1", "lens2" as ToolType)).toBe("/logit-lens/c1");
    });

    it("opens the workspace for retired or missing types, else the workbench entry", () => {
        expect(chartPath("c1", "lens", "ws")).toBe("/workbench/ws");
        expect(chartPath("c1", null, "ws")).toBe("/workbench/ws");
        expect(chartPath("c1", "lens")).toBe("/");
        expect(chartPath("c1", undefined, null)).toBe("/");
    });

    it("builds report, workspace and open-workspace paths", () => {
        expect(reportPath("r1")).toBe("/reports/r1");
        expect(workspacePath("ws")).toBe("/workspaces/ws");
        expect(openWorkspacePath("ws")).toBe("/workbench/ws");
    });

    it("maps a route segment back to its tool", () => {
        expect(toolForRouteSegment("logit-lens")).toBe("logit-lens");
        expect(toolForRouteSegment("j-lens")).toBe("jlens");
        expect(toolForRouteSegment("reports")).toBeUndefined();
    });
});
