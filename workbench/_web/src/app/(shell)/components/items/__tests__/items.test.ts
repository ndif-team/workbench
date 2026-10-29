import { describe, expect, it } from "bun:test";

import type { LibraryItem, WorkspaceLibrary } from "@/types/workspaces";
import { formatUpdated, recencyGroup } from "../formatUpdated";
import { chartLabel, chartName, itemLabel } from "../itemLabel";
import { describeContents, neighborInList } from "../workspaceContents";

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

    it("labels a chart the same way outside the library (report embeds)", () => {
        expect(chartLabel({ name: undefined, prompt: "  The Eiffel Tower is in\nParis" })).toEqual({
            text: "The Eiffel Tower is in",
            placeholder: false,
        });
        expect(chartLabel({ name: null, prompt: undefined }).placeholder).toBe(true);
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

describe("workspace contents", () => {
    const item = (id: string, workspaceId: string, kind: "chart" | "report" = "chart") =>
        ({ ...chart("", null), id, workspaceId, kind }) as LibraryItem;
    const folder = (id: string, items: LibraryItem[]) => ({
        id,
        name: id,
        isWorkshop: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        items,
    });
    const library: WorkspaceLibrary = {
        defaultWorkspaceId: "default",
        defaultItems: [item("a", "default"), item("b", "default"), item("c", "default")],
        workspaces: [folder("f1", [item("x", "f1"), item("y", "f1", "report")]), folder("f2", [])],
    };

    it("reads a workspace's contents in words", () => {
        expect(describeContents(library.workspaces[0])).toBe("1 chart and 1 report");
        expect(describeContents(folder("f", [item("p", "f"), item("q", "f")]))).toBe("2 charts");
        expect(describeContents(library.workspaces[1])).toBe("");
    });

    it("finds where to go after deleting the item on screen", () => {
        expect(neighborInList(library, item("a", "default"))?.id).toBe("b");
        expect(neighborInList(library, item("c", "default"))?.id).toBe("b");
        expect(neighborInList(library, item("x", "f1"))?.id).toBe("y");
        expect(neighborInList(library, item("y", "f1", "report"))?.id).toBe("x");
        const lone: WorkspaceLibrary = {
            ...library,
            workspaces: [folder("f1", [item("x", "f1")])],
        };
        expect(neighborInList(lone, item("x", "f1"))).toBeNull();
    });
});
