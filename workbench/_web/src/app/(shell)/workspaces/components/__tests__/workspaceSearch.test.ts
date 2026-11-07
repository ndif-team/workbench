import { describe, expect, it } from "bun:test";

import type { LibraryItem, LibraryWorkspace } from "@/types/workspaces";
import { searchWorkspaces } from "../workspaceSearch";

const chart = (id: string, name: string, prompt: string | null = null): LibraryItem => ({
    kind: "chart",
    id,
    workspaceId: "w",
    name,
    toolType: "logit-lens",
    model: null,
    prompt,
    hasData: true,
    position: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
});

const report = (id: string, title: string): LibraryItem => ({
    kind: "report",
    id,
    workspaceId: "w",
    title,
    position: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
});

const chat = (id: string, name: string): LibraryItem => ({
    kind: "chat",
    id,
    workspaceId: "w",
    name,
    model: "gpt2",
    position: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
});

const workspace = (id: string, name: string, items: LibraryItem[]): LibraryWorkspace => ({
    id,
    name,
    isWorkshop: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    items,
});

const library = [
    workspace("ioi", "IOI circuit", [
        chart("c1", "Name movers"),
        report("r1", "Draft findings"),
        chat("h1", "Which heads move names?"),
        chat("h2", "New chat"),
    ]),
    workspace("facts", "Factual recall", [
        chart("c2", "Untitled Chart", "The Eiffel Tower is in the city of"),
        chart("c3", "Capitals"),
    ]),
    workspace("empty", "Scratch", []),
];

const names = (query: string) => searchWorkspaces(library, query).map((m) => m.workspace.id);

describe("searchWorkspaces", () => {
    it("lists every workspace, with no item matches, for a blank query", () => {
        const matches = searchWorkspaces(library, "  ");
        expect(matches.map((m) => m.workspace.id)).toEqual(["ioi", "facts", "empty"]);
        expect(matches.every((m) => m.items.length === 0)).toBe(true);
    });

    it("finds a workspace by its name, ignoring case", () => {
        expect(names("ioi")).toEqual(["ioi"]);
        expect(names("SCRATCH")).toEqual(["empty"]);
    });

    it("finds a workspace by a chart's name or prompt, or a report's title, and says which", () => {
        expect(searchWorkspaces(library, "eiffel")).toEqual([
            { workspace: library[1], items: [library[1].items[0]] },
        ]);
        expect(searchWorkspaces(library, "draft")[0].items).toEqual([library[0].items[1]]);
        expect(names("movers")).toEqual(["ioi"]);
    });

    it("lists only the items that matched, not the rest of the workspace", () => {
        const [match] = searchWorkspaces(library, "capital");
        expect(match.workspace.id).toBe("facts");
        expect(match.items.map((i) => i.id)).toEqual(["c3"]);
    });

    it("finds a workspace by a chat's name", () => {
        expect(searchWorkspaces(library, "heads")).toEqual([
            { workspace: library[0], items: [library[0].items[2]] },
        ]);
    });

    it("doesn't match an untitled chart or a new chat by its placeholder label", () => {
        const untitled = [workspace("w", "Notes", [chart("c", "Untitled Chart")])];
        expect(searchWorkspaces(untitled, "untitled")).toEqual([]);
        expect(names("new chat")).toEqual([]);
    });
});
