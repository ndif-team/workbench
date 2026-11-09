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

    it("reports a /new origin that starts no chats as a plain link", () => {
        expect(ChatLaunch.origin("landing")).toBe("landing");
        expect(ChatLaunch.origin("resumed")).toBe("resumed");
        expect(ChatLaunch.origin("model_launch")).toBe("new_link");
    });
});
