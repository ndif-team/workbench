import { describe, it, expect } from "bun:test";

import { chartLaunchFromSearchParams, planChartLaunch } from "@/lib/chartLaunch";

describe("chart launch", () => {
    it("keeps only launch parameters from search params", () => {
        expect(
            chartLaunchFromSearchParams({
                tool: "J-Lens",
                model: ["gpt2", "ignored"],
                createNew: "true",
                models: "open",
            }),
        ).toEqual({ tool: "J-Lens", model: "gpt2" });
    });

    it("plans a logit lens chart from the landing composer", () => {
        expect(
            planChartLaunch({
                tool: "Logit Lens",
                model: "gpt2",
                prompt: "The Eiffel Tower is in",
            }),
        ).toEqual({
            type: "logit-lens",
            data: {
                model: "gpt2",
                prompt: "The Eiffel Tower is in",
                topk: 5,
                includeEntropy: false,
            },
        });
    });

    it("defaults to a blank logit lens chart", () => {
        expect(planChartLaunch({})).toEqual({
            type: "logit-lens",
            data: { model: "", prompt: "", topk: 5, includeEntropy: false },
        });
        expect(planChartLaunch({ tool: "not-a-tool" }).type).toBe("logit-lens");
    });

    it("accepts tool types as well as picker names", () => {
        expect(planChartLaunch({ tool: "jlens" }).type).toBe("jlens");
        expect(planChartLaunch({ tool: "patch-lens" })).toEqual({
            type: "patch-lens",
            data: {},
            chartData: undefined,
        });
    });

    it("parses activation patching positions", () => {
        expect(
            planChartLaunch({
                tool: "Activation Patching",
                model: "gpt2",
                srcPrompt: "a b",
                tgtPrompt: "c d",
                srcPos: "[1,[0,1]]",
                tgtPos: "[1,0]",
            }),
        ).toEqual({
            type: "activation-patching",
            data: {
                model: "gpt2",
                srcPrompt: "a b",
                tgtPrompt: "c d",
                srcPos: [1, [0, 1]],
                tgtPos: [1, 0],
                tgtFreeze: [],
            },
        });
        expect(() => planChartLaunch({ tool: "Activation Patching", srcPos: "{}" })).toThrow();
    });

    it("creates an empty chart pinned to the model for a deploy launch", () => {
        expect(
            planChartLaunch({ tool: "J-Lens", model: "big/model", prompt: "x", deploy: "true" }),
        ).toEqual({
            type: "jlens",
            data: { model: "big/model", prompt: "", topk: 5, includeEntropy: false },
        });
        expect(planChartLaunch({ deploy: "true" }).data).toMatchObject({
            model: "openai-community/gpt2",
        });
    });

    it("seeds patch lens prompts on the chart row", () => {
        expect(planChartLaunch({ tool: "patch-lens", prompt: "src" })).toEqual({
            type: "patch-lens",
            data: {},
            chartData: { sourcePrompt: "src", targetPrompt: "" },
        });
    });
});
