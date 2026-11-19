/**
 * Integration tests for chats and their messages (chatDb.ts) on SQLite.
 *
 * Covers where a chat is created (the default workspace, a folder, never
 * another user's or a workshop workspace), a chat created with its first
 * message (Home's composer), how a turn is appended (dense
 * positions, the chat named after its first message, a failed reply dropped
 * first, refused while a reply is pending, a reply alone for a
 * continuation), a mode settled by the first message, saving a reply,
 * deleting a chat with its messages, and moving a chat between workspaces.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import { db, clearDatabase } from "../client";
import { chatMessages, chats } from "../schema";
import {
    addChatTurn,
    createChat,
    createChatWithMessage,
    deleteChat,
    getChat,
    getChatMessages,
    regenerateReply,
    showBranch,
    updateChat,
    updateChatMessage,
} from "@/lib/queries/chatDb";
import { createWorkshop } from "@/lib/queries/workshopDb";
import {
    createWorkspace,
    getChatWorkspaceScope,
    getOrCreateDefaultWorkspace,
    moveChat,
} from "@/lib/queries/workspaceDb";
import { createLogitLensChartPair } from "@/lib/queries/chartDb";
import { branchTo, replyStatus } from "@/lib/chats";
import { DEFAULT_CHAT_NAME, DEFAULT_GENERATION_PARAMS, type ReplyRun } from "@/types/chats";

const USER = "user-chats";
const OTHER = "other-chats";

const newChat = { model: "meta-llama/Llama-3.2-1B-Instruct", mode: "chat" as const };

const pending: ReplyRun = {
    status: "pending",
    model: newChat.model,
    params: DEFAULT_GENERATION_PARAMS,
};

const settle = (status: "complete" | "error"): ReplyRun => ({ ...pending, status });

const workshopInput = () => ({
    name: "Pilot",
    allowedTools: ["logit-lens" as const],
    model: "gpt2",
    starterPrompt: "",
    allowModelChange: false,
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    createdBy: "admin@example.edu",
});

/** The chat's messages as (position, role, content) rows. */
const transcript = async (chatId: string) =>
    (await getChatMessages(USER, chatId)).map((m) => [m.position, m.data.role, m.content]);

/** The branch on screen as (position, role, content) rows. */
const branch = async (chatId: string) => {
    const chat = await getChat(USER, chatId);
    return branchTo(await getChatMessages(USER, chatId), chat!.headMessageId).map((m) => [
        m.position,
        m.data.role,
        m.content,
    ]);
};

/** Sends `content` and completes its reply with `answer`. */
const exchange = async (chatId: string, content: string, answer: string) => {
    const added = await addChatTurn(USER, chatId, { content, reply: pending });
    await updateChatMessage(USER, added[added.length - 1].id, {
        content: answer,
        run: settle("complete"),
    });
};

describe("creating a chat", () => {
    beforeEach(async () => {
        await clearDatabase();
    });

    it("files it in the default workspace, at the end, with the default name and settings", async () => {
        const def = await getOrCreateDefaultWorkspace(USER);
        await createLogitLensChartPair(def.id, {
            prompt: "The Eiffel Tower is in",
            model: "gpt2",
            topk: 5,
            includeEntropy: true,
        });

        const chat = await createChat(USER, newChat);

        expect(chat.workspaceId).toBe(def.id);
        expect(chat.name).toBe(DEFAULT_CHAT_NAME);
        expect(chat.model).toBe(newChat.model);
        expect(chat.mode).toBe("chat");
        expect(chat.data.params).toEqual(DEFAULT_GENERATION_PARAMS);
        expect(chat.position).toBe(1);
        expect(await getChatMessages(USER, chat.id)).toEqual([]);
    });

    it("files it in one of the user's folders", async () => {
        const folder = await createWorkspace(USER, "Folder");
        const params = { temperature: 0, maxNewTokens: 32 };

        const chat = await createChat(USER, {
            model: "gpt2",
            mode: "completion",
            params,
            workspaceId: folder.id,
        });

        expect(chat.workspaceId).toBe(folder.id);
        expect(chat.mode).toBe("completion");
        expect(chat.data.params).toEqual(params);
        expect((await getChatWorkspaceScope(chat.id))!.workspaceId).toBe(folder.id);
    });

    it("refuses another user's workspace and a workshop workspace", async () => {
        const theirs = await createWorkspace(OTHER, "Theirs");
        const workshop = await createWorkshop(workshopInput());
        const pilot = await createWorkspace(USER, "Pilot", workshop.id);

        await expect(createChat(USER, { ...newChat, workspaceId: theirs.id })).rejects.toThrow(
            "access denied",
        );
        await expect(createChat(USER, { ...newChat, workspaceId: "missing" })).rejects.toThrow(
            "access denied",
        );
        await expect(createChat(USER, { ...newChat, workspaceId: pilot.id })).rejects.toThrow(
            "workshop",
        );
        expect(await db.select().from(chats)).toEqual([]);
    });
});

describe("creating a chat with its first message", () => {
    beforeEach(async () => {
        await clearDatabase();
    });

    it("adds the message and a pending reply, names the chat after it and shows the reply", async () => {
        const folder = await createWorkspace(USER, "Folder");
        const params = { temperature: 0.2, maxNewTokens: 64 };

        const { chat, messages } = await createChatWithMessage(
            USER,
            { ...newChat, params, workspaceId: folder.id },
            "What is the capital of France?\nAnswer briefly.",
        );

        expect(chat.workspaceId).toBe(folder.id);
        expect(chat.name).toBe("What is the capital of France?");
        expect(messages.map((m) => [m.position, m.data.role, m.content])).toEqual([
            [0, "user", "What is the capital of France?\nAnswer briefly."],
            [1, "assistant", ""],
        ]);
        expect(chat.headMessageId).toBe(messages[1].id);
        expect(messages[1].data).toEqual({
            role: "assistant",
            run: { status: "pending", model: newChat.model, params },
        });
        expect(await getChat(USER, chat.id)).toEqual(chat);
        expect(await branch(chat.id)).toEqual([
            [0, "user", "What is the capital of France?\nAnswer briefly."],
            [1, "assistant", ""],
        ]);
    });

    it("creates an empty chat without a message", async () => {
        const { chat, messages } = await createChatWithMessage(USER, newChat, "");

        expect(chat.name).toBe(DEFAULT_CHAT_NAME);
        expect(chat.headMessageId).toBeNull();
        expect(messages).toEqual([]);
    });

    it("refuses an overlong message, another user's workspace and a workshop's, leaving no chat", async () => {
        const theirs = await createWorkspace(OTHER, "Theirs");
        const workshop = await createWorkshop(workshopInput());
        const pilot = await createWorkspace(USER, "Pilot", workshop.id);

        await expect(createChatWithMessage(USER, newChat, "x".repeat(100_001))).rejects.toThrow(
            "at most",
        );
        await expect(
            createChatWithMessage(USER, { ...newChat, workspaceId: theirs.id }, "Hi"),
        ).rejects.toThrow("access denied");
        await expect(
            createChatWithMessage(USER, { ...newChat, workspaceId: pilot.id }, "Hi"),
        ).rejects.toThrow("workshop");
        expect(await db.select().from(chats)).toEqual([]);
        expect(await db.select().from(chatMessages)).toEqual([]);
    });
});

describe("chat turns", () => {
    let chatId: string;

    beforeEach(async () => {
        await clearDatabase();
        chatId = (await createChat(USER, newChat)).id;
    });

    it("appends the message and a pending reply at dense positions", async () => {
        const first = await addChatTurn(USER, chatId, { content: "Hi", reply: pending });

        expect(first.map((m) => [m.position, m.data.role, m.content])).toEqual([
            [0, "user", "Hi"],
            [1, "assistant", ""],
        ]);
        expect(first[0].data).toEqual({ role: "user" });
        expect(first[1].data).toEqual({ role: "assistant", run: pending });

        await updateChatMessage(USER, first[1].id, {
            content: "Hello!",
            run: settle("complete"),
        });
        await addChatTurn(USER, chatId, { content: "How are you?", reply: pending });

        expect(await transcript(chatId)).toEqual([
            [0, "user", "Hi"],
            [1, "assistant", "Hello!"],
            [2, "user", "How are you?"],
            [3, "assistant", ""],
        ]);
    });

    it("names a chat still called New chat after its first message, and only then", async () => {
        await exchange(chatId, "  What is the capital of France?\nAnswer briefly.", "Paris.");
        expect((await getChat(USER, chatId))!.name).toBe("What is the capital of France?");

        await exchange(chatId, "And of Italy?", "Rome.");
        expect((await getChat(USER, chatId))!.name).toBe("What is the capital of France?");
    });

    it("cuts a long first message to a short name", async () => {
        await exchange(chatId, "word ".repeat(40), "ok");
        const name = (await getChat(USER, chatId))!.name;
        expect(name.length).toBeLessThanOrEqual(60);
        expect(name.endsWith("…")).toBe(true);
    });

    it("keeps a name the user gave before the first message", async () => {
        await db.update(chats).set({ name: "Capitals" }).where(eq(chats.id, chatId));
        await exchange(chatId, "What is the capital of France?", "Paris.");
        expect((await getChat(USER, chatId))!.name).toBe("Capitals");
    });

    it("makes a message sent after a failed reply another version of the unanswered one", async () => {
        const [hi, reply] = await addChatTurn(USER, chatId, { content: "Hi", reply: pending });
        await updateChatMessage(USER, reply.id, {
            run: { ...settle("error"), error: "NDIF is down" },
        });

        const [again] = await addChatTurn(USER, chatId, { content: "Hi again", reply: pending });

        expect(again.parentId).toBe(hi.parentId);
        expect(await branch(chatId)).toEqual([
            [0, "user", "Hi again"],
            [1, "assistant", ""],
        ]);
        const ids = (await getChatMessages(USER, chatId)).map((m) => m.id);
        expect(ids).toContain(hi.id);
        expect(ids).not.toContain(reply.id);
    });

    it("lets a completion's text follow its own text when the continuation failed", async () => {
        const doc = (await createChat(USER, { model: "gpt2", mode: "completion" })).id;
        const [, reply] = await addChatTurn(USER, doc, { content: "Once upon", reply: pending });
        await updateChatMessage(USER, reply.id, { run: settle("error") });

        await addChatTurn(USER, doc, { content: " a time", reply: pending });

        expect(await branch(doc)).toEqual([
            [0, "user", "Once upon"],
            [1, "user", " a time"],
            [2, "assistant", ""],
        ]);
    });

    it("refuses a new message while the last reply is pending", async () => {
        await addChatTurn(USER, chatId, { content: "Hi", reply: pending });

        await expect(
            addChatTurn(USER, chatId, { content: "Hello?", reply: pending }),
        ).rejects.toThrow("Wait for the reply");
        await expect(addChatTurn(USER, chatId, { content: "", reply: pending })).rejects.toThrow(
            "Wait for the reply",
        );
        expect((await transcript(chatId)).length).toBe(2);
    });

    it("adds only a reply for an empty message (a continuation)", async () => {
        await exchange(chatId, "Once upon a time", " there was");

        const added = await addChatTurn(USER, chatId, { content: "", reply: pending });

        expect(added.map((m) => [m.position, m.data.role])).toEqual([[2, "assistant"]]);
        expect(await transcript(chatId)).toEqual([
            [0, "user", "Once upon a time"],
            [1, "assistant", " there was"],
            [2, "assistant", ""],
        ]);
        expect((await getChat(USER, chatId))!.name).toBe("Once upon a time");
    });

    it("keeps the ids the page showed the turn under, and refuses ids that aren't UUIDs", async () => {
        const ids = { user: crypto.randomUUID(), reply: crypto.randomUUID() };

        const added = await addChatTurn(USER, chatId, { content: "Hi", reply: pending, ids });

        expect(added.map((m) => m.id)).toEqual([ids.user, ids.reply]);
        expect((await getChat(USER, chatId))!.headMessageId).toBe(ids.reply);
        await updateChatMessage(USER, ids.reply, { content: "Hello!", run: settle("complete") });
        await expect(
            addChatTurn(USER, chatId, {
                content: "Again",
                reply: pending,
                ids: { user: "not-a-uuid", reply: crypto.randomUUID() },
            }),
        ).rejects.toThrow("Invalid message id");
    });

    it("refuses a turn on a chat that doesn't exist", async () => {
        await expect(
            addChatTurn(USER, "missing", { content: "Hi", reply: pending }),
        ).rejects.toThrow("Chat not found");
    });

    it("refuses a message over the length limit", async () => {
        await expect(
            addChatTurn(USER, chatId, { content: "x".repeat(100_001), reply: pending }),
        ).rejects.toThrow("at most");
        expect(await transcript(chatId)).toEqual([]);
    });
});

describe("a chat's mode", () => {
    let chatId: string;

    beforeEach(async () => {
        await clearDatabase();
        chatId = (await createChat(USER, newChat)).id;
    });

    it("changes before the first message", async () => {
        const updated = await updateChat(USER, chatId, { mode: "completion" });
        expect(updated.mode).toBe("completion");
    });

    it("is settled by the first message, while the model and settings still change", async () => {
        await addChatTurn(USER, chatId, { content: "Hi", reply: pending });

        await expect(updateChat(USER, chatId, { mode: "completion" })).rejects.toThrow(
            "can't change once it has messages",
        );
        const updated = await updateChat(USER, chatId, {
            mode: "chat",
            model: "google/gemma-2-9b-it",
            params: { temperature: 0, maxNewTokens: 64 },
        });
        expect([updated.mode, updated.model, updated.data.params.temperature]).toEqual([
            "chat",
            "google/gemma-2-9b-it",
            0,
        ]);
    });
});

describe("branches", () => {
    let chatId: string;

    beforeEach(async () => {
        await clearDatabase();
        chatId = (await createChat(USER, newChat)).id;
    });

    /** Regenerates the reply to "Hi" as "Hey!", next to the first one ("Hello!"). */
    const twoVersions = async () => {
        await exchange(chatId, "Hi", "Hello!");
        const [, first] = await getChatMessages(USER, chatId);
        const second = await regenerateReply(USER, chatId, first.id, pending);
        await updateChatMessage(USER, second.id, { content: "Hey!", run: settle("complete") });
        return { first, second };
    };

    it("regenerates a reply beside the old one, which stays as another version", async () => {
        await exchange(chatId, "Hi", "Hello!");
        const [, old] = await getChatMessages(USER, chatId);

        const id = crypto.randomUUID();
        const fresh = await regenerateReply(USER, chatId, old.id, pending, id);

        expect(fresh.id).toBe(id);
        expect(fresh.parentId).toBe(old.parentId);
        expect(fresh.position).toBe(old.position);
        expect((await getChat(USER, chatId))!.headMessageId).toBe(fresh.id);
        expect(await branch(chatId)).toEqual([
            [0, "user", "Hi"],
            [1, "assistant", ""],
        ]);
        expect((await getChatMessages(USER, chatId)).map((m) => m.content)).toContain("Hello!");
    });

    it("shows another version, down to its newest message", async () => {
        const { first, second } = await twoVersions();
        await exchange(chatId, "How are you?", "Fine.");

        await showBranch(USER, chatId, first.id);
        expect(await branch(chatId)).toEqual([
            [0, "user", "Hi"],
            [1, "assistant", "Hello!"],
        ]);

        await showBranch(USER, chatId, second.id);
        expect(await branch(chatId)).toEqual([
            [0, "user", "Hi"],
            [1, "assistant", "Hey!"],
            [2, "user", "How are you?"],
            [3, "assistant", "Fine."],
        ]);
    });

    it("sends on the version on screen", async () => {
        const { first } = await twoVersions();
        await showBranch(USER, chatId, first.id);

        const [question] = await addChatTurn(USER, chatId, {
            content: "Who are you?",
            reply: pending,
        });

        expect(question.parentId).toBe(first.id);
    });

    it("refuses to regenerate while a reply is pending, or anything but a reply", async () => {
        const [hi, reply] = await addChatTurn(USER, chatId, { content: "Hi", reply: pending });
        await expect(regenerateReply(USER, chatId, reply.id, pending)).rejects.toThrow(
            "Wait for the reply",
        );

        await updateChatMessage(USER, reply.id, { content: "Hello!", run: settle("complete") });
        await expect(regenerateReply(USER, chatId, hi.id, pending)).rejects.toThrow(
            "Reply not found",
        );
    });

    it("refuses a message from another chat", async () => {
        const other = (await createChat(USER, newChat)).id;
        await exchange(other, "Hi", "Hello!");
        const [foreign, foreignReply] = await getChatMessages(USER, other);

        await expect(showBranch(USER, chatId, foreign.id)).rejects.toThrow("Message not found");
        await expect(regenerateReply(USER, chatId, foreignReply.id, pending)).rejects.toThrow(
            "Reply not found",
        );
    });
});

describe("saving a reply", () => {
    beforeEach(async () => {
        await clearDatabase();
    });

    it("saves its text and outcome, and resets it for a retry", async () => {
        const chatId = (await createChat(USER, newChat)).id;
        const [, reply] = await addChatTurn(USER, chatId, { content: "Hi", reply: pending });
        const done = { ...settle("complete"), finishReason: "stop" as const, nTokens: 3 };

        const saved = await updateChatMessage(USER, reply.id, {
            content: "Hello!",
            run: done,
        });
        expect(saved.content).toBe("Hello!");
        expect(saved.data).toEqual({ role: "assistant", run: done });

        const reset = await updateChatMessage(USER, reply.id, { content: "", run: pending });
        expect(reset.content).toBe("");
        expect(replyStatus(reset)).toBe("pending");
        expect((await getChatMessages(USER, chatId)).length).toBe(2);
    });

    it("updates only replies, never the user's own messages", async () => {
        const chatId = (await createChat(USER, newChat)).id;
        const [message] = await addChatTurn(USER, chatId, { content: "Hi", reply: pending });

        await expect(
            updateChatMessage(USER, message.id, { content: "Edited", run: settle("complete") }),
        ).rejects.toThrow("Message not found");
        expect((await transcript(chatId))[0]).toEqual([0, "user", "Hi"]);
    });

    it("throws for a message that doesn't exist", async () => {
        await expect(
            updateChatMessage(USER, "missing", { run: settle("complete") }),
        ).rejects.toThrow("Message not found");
    });
});

describe("deleting a chat", () => {
    beforeEach(async () => {
        await clearDatabase();
    });

    it("removes its messages too, and leaves other chats alone", async () => {
        const doomed = (await createChat(USER, newChat)).id;
        const kept = (await createChat(USER, newChat)).id;
        await exchange(doomed, "Hi", "Hello!");
        await exchange(kept, "Hey", "Hi there");

        await deleteChat(USER, doomed);

        expect(await getChat(USER, doomed)).toBeNull();
        const orphans = await db.select().from(chatMessages).where(eq(chatMessages.chatId, doomed));
        expect(orphans).toEqual([]);
        expect((await transcript(kept)).length).toBe(2);
    });

    it("throws for a chat that doesn't exist", async () => {
        await expect(deleteChat(USER, "missing")).rejects.toThrow("Chat not found");
    });
});

describe("moving a chat", () => {
    beforeEach(async () => {
        await clearDatabase();
    });

    it("moves it with its messages to the end of a folder and back to the default workspace", async () => {
        const def = await getOrCreateDefaultWorkspace(USER);
        const folder = await createWorkspace(USER, "Folder");
        await createChat(USER, { ...newChat, workspaceId: folder.id });
        const chat = await createChat(USER, newChat);
        await exchange(chat.id, "Hi", "Hello!");
        const before = (await getChat(USER, chat.id))!;

        await moveChat(USER, chat.id, folder.id);

        const moved = (await getChat(USER, chat.id))!;
        expect(moved.workspaceId).toBe(folder.id);
        expect(moved.position).toBe(1);
        expect(moved.updatedAt.getTime()).toBe(before.updatedAt.getTime());
        expect((await getChatWorkspaceScope(chat.id))!).toMatchObject({
            workspaceId: folder.id,
            isDefault: false,
        });
        expect((await transcript(chat.id)).length).toBe(2);

        await moveChat(USER, chat.id, null);
        expect((await getChatWorkspaceScope(chat.id))!).toMatchObject({
            workspaceId: def.id,
            isDefault: true,
        });
    });

    it("refuses a move into a workshop workspace", async () => {
        const workshop = await createWorkshop(workshopInput());
        const pilot = await createWorkspace(USER, "Pilot", workshop.id);
        const chat = await createChat(USER, newChat);

        await expect(moveChat(USER, chat.id, pilot.id)).rejects.toThrow("workshop");
        expect((await getChat(USER, chat.id))!.workspaceId).toBe(chat.workspaceId);
    });

    it("throws for a chat that doesn't exist", async () => {
        await expect(moveChat(USER, "missing", null)).rejects.toThrow("Chat not found");
    });
});
