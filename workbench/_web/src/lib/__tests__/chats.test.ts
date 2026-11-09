import { describe, it, expect } from "bun:test";

import type { ChatMessage } from "@/db/schema";
import {
    branchTo,
    conversationBefore,
    latestLeaf,
    newMessageId,
    placeTurn,
    siblingsOf,
} from "@/lib/chats";
import { DEFAULT_GENERATION_PARAMS, type ReplyRun } from "@/types/chats";

const run = (status: ReplyRun["status"]): ReplyRun => ({
    status,
    model: "gpt2",
    params: DEFAULT_GENERATION_PARAMS,
});

let clock = 0;
/** A message in a chat's tree; each one is newer than the last. */
const message = (
    id: string,
    parentId: string | null,
    position: number,
    data: ChatMessage["data"],
    content = id,
): ChatMessage => ({
    id,
    chatId: "chat",
    parentId,
    position,
    content,
    data,
    createdAt: new Date(++clock * 1000),
    updatedAt: new Date(clock * 1000),
});

const user = (id: string, parentId: string | null, position: number) =>
    message(id, parentId, position, { role: "user" });
const reply = (id: string, parentId: string, position: number, status: ReplyRun["status"]) =>
    message(id, parentId, position, { role: "assistant", run: run(status) });

// q1 → a1 (complete) → q2 → a2 (failed); a1b regenerated beside a1.
const tree = () => [
    user("q1", null, 0),
    reply("a1", "q1", 1, "complete"),
    user("q2", "a1", 2),
    reply("a2", "q2", 3, "error"),
    reply("a1b", "q1", 1, "complete"),
];

describe("chat trees", () => {
    it("walks a branch from its first message to its end", () => {
        expect(branchTo(tree(), "a2").map((m) => m.id)).toEqual(["q1", "a1", "q2", "a2"]);
        expect(branchTo(tree(), null)).toEqual([]);
    });

    it("lists a message's versions oldest first", () => {
        const messages = tree();
        expect(siblingsOf(messages, messages[1]).map((m) => m.id)).toEqual(["a1", "a1b"]);
    });

    it("follows the newest message down to a branch's end", () => {
        expect(latestLeaf(tree(), "a1")).toBe("a2");
        expect(latestLeaf(tree(), "q1")).toBe("a1b");
    });

    it("builds a reply's conversation from its branch, without failed replies", () => {
        const messages = [...tree(), reply("a3", "a2", 4, "pending")];
        expect(conversationBefore(messages, messages[5])).toEqual([
            { role: "user", content: "q1" },
            { role: "assistant", content: "a1" },
            { role: "user", content: "q2" },
        ]);
    });
});

describe("placing a turn", () => {
    it("follows the end of the branch on screen", () => {
        expect(placeTurn(tree(), "a1b", "chat", true)).toEqual({
            parentId: "a1b",
            depth: 2,
            dropId: null,
        });
    });

    it("drops a failed reply and makes the new message a version of the unanswered one", () => {
        expect(placeTurn(tree(), "a2", "chat", true)).toEqual({
            parentId: "a1",
            depth: 2,
            dropId: "a2",
        });
    });

    it("lets a completion's text follow its own text", () => {
        expect(placeTurn(tree(), "a2", "completion", true)).toEqual({
            parentId: "q2",
            depth: 3,
            dropId: "a2",
        });
    });

    it("puts a continuation's reply right after the dropped one's message", () => {
        expect(placeTurn(tree(), "a2", "completion", false)).toEqual({
            parentId: "q2",
            depth: 3,
            dropId: "a2",
        });
    });

    it("starts an empty chat at the top", () => {
        expect(placeTurn([], null, "chat", true)).toEqual({
            parentId: null,
            depth: 0,
            dropId: null,
        });
    });
});

describe("message ids", () => {
    it("are v4 UUIDs", () => {
        expect(newMessageId()).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
    });
});
