import type { ToolOptionValues } from "@/types/models";

/**
 * The chart Home's hero invites a visitor to try (`LandingComposer`): one
 * click opens `TOOL` on `MODEL` with `OPTIONS` picked. To feature something
 * else, change these and the hero's line; the launch itself stays the same.
 */
export class FeaturedLaunch {
    /** Names what is featured, as `featured_launch`'s `feature`. */
    static readonly ID = "looped-inkling";
    static readonly MODEL = "thinkingmachines/Inkling-2-Mini";
    /** The tool, by its name in the tool picker. */
    static readonly TOOL = "Logit Lens";
    /** The picks for the options the tool takes on the model (`ToolOptions`). */
    static readonly OPTIONS: ToolOptionValues = { lens: "coda" };

    /**
     * The launch's `/new` parameters. It is a deploy launch: the chart opens
     * empty on the model, so a model that isn't deployed shows its deploying
     * state instead of a failed run.
     */
    static params(workspaceId?: string): URLSearchParams {
        const params = new URLSearchParams({
            model: FeaturedLaunch.MODEL,
            tool: FeaturedLaunch.TOOL,
            options: JSON.stringify(FeaturedLaunch.OPTIONS),
            deploy: "true",
        });
        if (workspaceId) params.set("workspaceId", workspaceId);
        return params;
    }
}
