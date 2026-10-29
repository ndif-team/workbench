import { describe, expect, it } from "bun:test";

import type { LibraryItem } from "@/types/workspaces";
import { formatUpdated, recencyGroup } from "../formatUpdated";
import { chartName, itemLabel } from "../itemLabel";

const chart = (name: string, prompt: string | null): LibraryItem => ({
    kind: "chart",
    id: "c1",
    workspaceId: "w1",
    name,
    toolType: "logit-lens",
    model: null,
    prompt,
    hasData: false,
    position: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
});

describe("itemLabel", () => {
    it("prefers the chart's own name", () => {
        expect(itemLabel(chart("Name movers", "When Mary and John"))).toEqual({
            text: "Name movers",
            placeholder: false,
        });
    });

    it("labels an unnamed chart by the first line of its prompt", () => {
        expect(itemLabel(chart("Untitled Chart", "Paris is the capital of\nFrance"))).toEqual({
            text: "Paris is the capital of",
            placeholder: false,
        });
    });

    it("falls back to a placeholder without a name or prompt", () => {
        expect(itemLabel(chart("Untitled Chart", null))).toEqual({
            text: "Untitled chart",
            placeholder: true,
        });
    });

    it("treats the stored default name as no name", () => {
        expect(chartName("Untitled Chart")).toBe("");
        expect(chartName("  Logit lens  ")).toBe("Logit lens");
    });
});

describe("dates", () => {
    const now = new Date(2026, 9, 29, 15, 0);
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

    it("formats how long ago something changed", () => {
        expect(formatUpdated(hoursAgo(0.01), now)).toBe("just now");
        expect(formatUpdated(hoursAgo(0.5), now)).toBe("30 min ago");
        expect(formatUpdated(hoursAgo(3), now)).toBe("3 h ago");
        expect(formatUpdated(hoursAgo(30), now)).toBe("yesterday");
        expect(formatUpdated(hoursAgo(24 * 4), now)).toBe("4 days ago");
        expect(formatUpdated(new Date(2026, 9, 2), now)).toBe("Oct 2");
        expect(formatUpdated(new Date(2025, 9, 2), now)).toBe("Oct 2, 2025");
    });

    it("files dates under calendar-day recency groups", () => {
        expect(recencyGroup(new Date(2026, 9, 29, 0, 5), now)).toBe("Today");
        expect(recencyGroup(new Date(2026, 9, 28, 23, 55), now)).toBe("Yesterday");
        expect(recencyGroup(new Date(2026, 9, 24), now)).toBe("Previous 7 days");
        expect(recencyGroup(new Date(2026, 9, 5), now)).toBe("Previous 30 days");
        expect(recencyGroup(new Date(2026, 7, 1), now)).toBe("Older");
    });
});
