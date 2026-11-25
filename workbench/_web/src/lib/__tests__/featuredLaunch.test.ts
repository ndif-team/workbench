import { describe, expect, it } from "bun:test";

import { chartLaunchFromSearchParams, planChartLaunch } from "@/lib/chartLaunch";
import { FeaturedLaunch } from "@/lib/featuredLaunch";
import { pendingRequestPath } from "@/lib/pendingRequest";

/** The chart a `/new` URL's query would create. */
const planOf = (query: URLSearchParams | string) =>
    planChartLaunch(chartLaunchFromSearchParams(Object.fromEntries(new URLSearchParams(query))));

const FEATURED_PLAN = {
    type: "logit-lens",
    data: {
        model: FeaturedLaunch.MODEL,
        prompt: "",
        topk: 5,
        includeEntropy: false,
        options: FeaturedLaunch.OPTIONS,
    },
} as const;

describe("the featured launch", () => {
    it("opens an empty chart of its tool on its model, with its options picked", () => {
        expect(planOf(FeaturedLaunch.params())).toEqual(FEATURED_PLAN);
    });

    it("is a deploy launch, and files the chart where it is told to", () => {
        const params = FeaturedLaunch.params("workspace-1");
        expect(params.get("deploy")).toBe("true");
        expect(params.get("workspaceId")).toBe("workspace-1");
        expect(FeaturedLaunch.params().has("workspaceId")).toBe(false);
    });

    it("comes back whole from a sign-in it had to wait for", () => {
        const params = FeaturedLaunch.params();
        const path = pendingRequestPath({
            model: params.get("model")!,
            tool: params.get("tool") ?? undefined,
            options: params.get("options") ?? undefined,
            deploy: params.get("deploy") ?? undefined,
            timestamp: 0,
        });
        expect(planOf(path.slice(path.indexOf("?") + 1))).toEqual(FEATURED_PLAN);
    });
});
