import { describe, expect, it } from "bun:test";

import type { Model, ToolOption } from "@/types/models";
import { ToolOptions } from "../toolOptions";

const choice = (value: string) => ({ value, label: value, description: `${value}.` });

const LENS: ToolOption = {
    name: "lens",
    label: "Lens",
    default: "logit",
    choices: [choice("logit"), choice("coda")],
};
const PATCH: ToolOption = {
    name: "patch",
    label: "Patch",
    default: "full_state",
    choices: [choice("active_block"), choice("live_state"), choice("full_state")],
};

const model = (tool_options?: Model["tool_options"]): Model => ({
    name: "org/model",
    is_chat: false,
    n_layers: 24,
    params: "1B",
    gated: false,
    allowed: true,
    tool_options,
});

describe("ToolOptions.of", () => {
    it("lists what a tool takes on the model", () => {
        const looped = model({ "logit-lens": [LENS], "activation-patching": [PATCH] });
        expect(ToolOptions.of(looped, "logit-lens")).toEqual([LENS]);
        expect(ToolOptions.of(looped, "activation-patching")).toEqual([PATCH]);
    });

    it("is empty for a tool the model lists nothing for, and for no model", () => {
        expect(ToolOptions.of(model({ "logit-lens": [LENS] }), "jlens")).toEqual([]);
        expect(ToolOptions.of(model(), "logit-lens")).toEqual([]);
        expect(ToolOptions.of(undefined, "logit-lens")).toEqual([]);
    });

    it("gives the same empty list each time, so a hook depending on it holds still", () => {
        expect(ToolOptions.of(undefined, "logit-lens")).toBe(ToolOptions.of(model(), "jlens"));
    });
});

describe("ToolOptions.values", () => {
    it("runs an option nothing is picked for at its default", () => {
        expect(ToolOptions.values([LENS, PATCH], undefined)).toEqual({
            lens: "logit",
            patch: "full_state",
        });
    });

    it("keeps a pick the option offers", () => {
        expect(ToolOptions.values([PATCH], { patch: "live_state" })).toEqual({
            patch: "live_state",
        });
    });

    it("falls back to the default for a value the option does not take", () => {
        expect(ToolOptions.values([PATCH], { patch: "layer" })).toEqual({ patch: "full_state" });
    });

    it("drops picks for options the model does not offer", () => {
        expect(ToolOptions.values([LENS], { lens: "coda", patch: "live_state" })).toEqual({
            lens: "coda",
        });
    });

    it("is undefined for a model that offers none, whatever was picked", () => {
        expect(ToolOptions.values([], { lens: "coda" })).toBeUndefined();
    });
});

describe("ToolOptions.equal", () => {
    it("compares the value of every option", () => {
        expect(ToolOptions.equal({ lens: "coda" }, { lens: "coda" })).toBe(true);
        expect(ToolOptions.equal({ lens: "coda" }, { lens: "logit" })).toBe(false);
        expect(ToolOptions.equal({ lens: "coda" }, undefined)).toBe(false);
        expect(ToolOptions.equal(undefined, undefined)).toBe(true);
    });
});

describe("how an option is offered", () => {
    it("one with two values is on or off, on being the value that is not its default", () => {
        expect(ToolOptions.isToggle(LENS)).toBe(true);
        expect(ToolOptions.on(LENS).value).toBe("coda");
        expect(ToolOptions.on({ ...LENS, default: "coda" }).value).toBe("logit");
    });

    it("one with more values is a pick among them", () => {
        expect(ToolOptions.isToggle(PATCH)).toBe(false);
        expect(ToolOptions.choice(PATCH, "live_state")?.value).toBe("live_state");
        expect(ToolOptions.choice(PATCH, undefined)?.value).toBe("full_state");
    });
});
