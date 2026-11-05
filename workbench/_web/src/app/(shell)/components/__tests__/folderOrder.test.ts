import { describe, expect, it } from "bun:test";

import type { LibraryWorkspace } from "@/types/workspaces";
import { inFolderOrder, visibleFolders } from "../shell/folderOrder";

const folder = (id: string, isWorkshop = false): LibraryWorkspace => ({
    id,
    name: id,
    isWorkshop,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [],
});

describe("sidebar folders", () => {
    const ids = (list: LibraryWorkspace[]) => list.map((f) => f.id);

    it("lists workshop folders after the user's own", () => {
        expect(ids(inFolderOrder([folder("w", true), folder("a"), folder("b")]))).toEqual([
            "a",
            "b",
            "w",
        ]);
    });

    it("shows the first five, plus the folder of the item on screen", () => {
        const folders = ["a", "b", "c", "d", "e", "f", "g"].map((id) => folder(id));
        expect(ids(visibleFolders(folders, null))).toEqual(["a", "b", "c", "d", "e"]);
        expect(ids(visibleFolders(folders, "c"))).toEqual(["a", "b", "c", "d", "e"]);
        expect(ids(visibleFolders(folders, "g"))).toEqual(["a", "b", "c", "d", "e", "g"]);
    });
});
