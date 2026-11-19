import { describe, it, expect } from "bun:test";

import { ChatLaunch } from "@/lib/chatLaunch";
import type { Model } from "@/types/models";

const model = (name: string, isChat: boolean, status: Model["status"] = "hot"): Model =>
    ({ name, is_chat: isChat, status, allowed: true, gated: false }) as Model;

const MODELS = [
    model("openai-community/gpt2", false),
    model("meta-llama/Llama-3.1-8B-Instruct", true),
    model("meta-llama/Llama-3.1-70B-Instruct", true, "cold"),
];

describe("ChatLaunch", () => {
    it("tells a chat launch from a chart's by its tool, ignoring case", () => {
        expect(ChatLaunch.is({ tool: "Chat" })).toBe(true);
        expect(ChatLaunch.is({ tool: "chat" })).toBe(true);
        expect(ChatLaunch.is({ tool: "Logit Lens" })).toBe(false);
        expect(ChatLaunch.is({})).toBe(false);
    });

    it("takes the request's model, mode, message and folder as given", () => {
        expect(
            ChatLaunch.draft({
                tool: "Chat",
                model: "openai-community/gpt2",
                mode: "completion",
                prompt: "Once upon a time",
                workspaceId: "folder",
            }),
        ).toEqual({
            model: "openai-community/gpt2",
            mode: "completion",
            content: "Once upon a time",
            workspaceId: "folder",
        });
    });

    it("needs the catalog for a mode the request doesn't name, and takes its model's", () => {
        const request = { tool: "Chat", model: "openai-community/gpt2", prompt: "Hi" };
        expect(ChatLaunch.draft(request)).toBeNull();
        expect(ChatLaunch.draft(request, MODELS)).toEqual({
            model: "openai-community/gpt2",
            mode: "completion",
            content: "Hi",
        });
    });

    it("starts on the default chat model when the request names none", () => {
        expect(ChatLaunch.draft({ tool: "Chat" })).toBeNull();
        expect(ChatLaunch.draft({ tool: "Chat" }, MODELS)).toEqual({
            model: "meta-llama/Llama-3.1-8B-Instruct",
            mode: "chat",
            content: "",
        });
        expect(ChatLaunch.draft({ tool: "Chat", mode: "bogus" }, [])).toBeNull();
    });

    it("carries the settings a link names, as a launch writes them", () => {
        const query = new URLSearchParams({ tool: "Chat", model: "gpt2", mode: "completion" });
        ChatLaunch.tagParams(query, { temperature: 0, maxNewTokens: 1024 });
        expect(Object.fromEntries(query)).toMatchObject({ temperature: "0", maxNewTokens: "1024" });
        expect(ChatLaunch.draft(Object.fromEntries(query))?.params).toEqual({
            temperature: 0,
            maxNewTokens: 1024,
        });
    });

    it("leaves default settings out of a link, and a link without settings takes none", () => {
        const query = new URLSearchParams();
        ChatLaunch.tagParams(query, { temperature: 0.7, maxNewTokens: 256 });
        expect(query.toString()).toBe("");
        expect(
            ChatLaunch.draft({ tool: "Chat", model: "gpt2", mode: "chat" })?.params,
        ).toBeUndefined();
    });

    it("takes the default for a setting a link gets wrong", () => {
        const draft = (temperature: string, maxNewTokens: string) =>
            ChatLaunch.draft({
                tool: "Chat",
                model: "gpt2",
                mode: "chat",
                temperature,
                maxNewTokens,
            })?.params;
        expect(draft("5", "4096")).toEqual({ temperature: 0.7, maxNewTokens: 256 });
        expect(draft("", "1.5")).toEqual({ temperature: 0.7, maxNewTokens: 256 });
        expect(draft("1.2", "abc")).toEqual({ temperature: 1.2, maxNewTokens: 256 });
    });

    it("reports a /new origin that starts no chats as a plain link", () => {
        expect(ChatLaunch.origin("landing")).toBe("landing");
        expect(ChatLaunch.origin("resumed")).toBe("resumed");
        expect(ChatLaunch.origin("model_launch")).toBe("new_link");
    });
});
