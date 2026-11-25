import { toolTypes, type ToolType } from "@/types/charts";
import type { LogitLensConfigData } from "@/types/logitLens";
import type { JLensConfigData } from "@/types/jlens";
import type { ActivationPatchingConfigData, SourcePosition } from "@/types/activationPatching";
import type { PatchLensChartData } from "@/types/patchLens";
import type { ToolOptionValues } from "@/types/models";
import { toolTypeFromDisplay } from "@/lib/toolSupport";

/**
 * Chart-creation parameters carried in `/new?…` URLs (the landing composer, the
 * model launch dialog, the post-login resume). `tool` is a picker display name
 * ("Logit Lens") or a tool type ("patch-lens"); `srcPos`, `tgtPos` and
 * `tgtFreeze` are JSON arrays; `options` is a JSON object of the picks for the
 * options the tool takes on the model (`ToolOptionValues`); `deploy=true`
 * creates an empty chart for a model that is being deployed; `workspaceId`
 * files the chart in that workspace instead of the default one.
 */
const CHART_LAUNCH_PARAMS = [
    "tool",
    "model",
    "prompt",
    "srcPrompt",
    "tgtPrompt",
    "srcPos",
    "tgtPos",
    "tgtFreeze",
    "options",
    "deploy",
    "workspaceId",
] as const;

export type ChartLaunchRequest = Partial<Record<(typeof CHART_LAUNCH_PARAMS)[number], string>>;

/**
 * The chart to create for a launch request: its tool (`type`) and config
 * (`data`), plus the chart row's initial data for patch-lens, which keeps its
 * prompts on the chart rather than the config.
 */
export type ChartLaunchPlan =
    | { type: "logit-lens"; data: LogitLensConfigData }
    | { type: "jlens"; data: JLensConfigData }
    | { type: "activation-patching"; data: ActivationPatchingConfigData }
    | { type: "patch-lens"; data: Record<string, never>; chartData?: PatchLensChartData };

/**
 * Where a chart launch started, reported as `chart_created`'s `origin`: New
 * chart in the sidebar or on a workspace page, Home's or the landing page's
 * composer, the hero's featured launch, the models page's launch dialog, the workshop
 * sidebar, a `/new` link, a launch resumed after sign-in, and the charts the
 * server creates: opening an empty workspace, and joining a workshop.
 */
export type ChartOrigin = (typeof ChartOrigins.ALL)[number];

/** The `ChartOrigin` values, and how a `/new` URL carries one (`origin=…`). */
export class ChartOrigins {
    static readonly ALL = [
        "sidebar",
        "workspace_page",
        "home",
        "landing",
        "featured_launch",
        "model_launch",
        "workshop_sidebar",
        "new_link",
        "resumed",
        "workspace_open",
        "workshop_join",
    ] as const;

    private static readonly PARAM = "origin";

    /** `path`, a `/new` URL, carrying `origin`. */
    static tag(path: string, origin: ChartOrigin): string {
        return `${path}${path.includes("?") ? "&" : "?"}${ChartOrigins.PARAM}=${origin}`;
    }

    /** The origin a `/new` page's search params name; a plain link when they name none. */
    static fromSearchParams(params: Record<string, string | string[] | undefined>): ChartOrigin {
        const value = params[ChartOrigins.PARAM];
        return ChartOrigins.ALL.find((origin) => origin === value) ?? "new_link";
    }
}

/** The launch parameters present in a page's search params; other keys are dropped. */
export function chartLaunchFromSearchParams(
    params: Record<string, string | string[] | undefined>,
): ChartLaunchRequest {
    const request: ChartLaunchRequest = {};
    for (const key of CHART_LAUNCH_PARAMS) {
        const value = params[key];
        const first = Array.isArray(value) ? value[0] : value;
        if (first !== undefined) request[key] = first;
    }
    return request;
}

/** The tool a launch's `tool` names: a picker display name or a tool type, logit lens otherwise. */
export const launchTool = (tool: string | undefined): ToolType => {
    if (!tool) return "logit-lens";
    const fromDisplay = toolTypeFromDisplay(tool);
    if (fromDisplay) return fromDisplay;
    return (toolTypes as readonly string[]).includes(tool) ? (tool as ToolType) : "logit-lens";
};

const parsePositions = <T>(json: string | undefined): T[] => {
    if (!json) return [];
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) throw new Error("Expected a JSON array of token positions");
    return parsed as T[];
};

/** A launch's option picks, or undefined when it names none. */
const parseOptions = (json: string | undefined): ToolOptionValues | undefined => {
    if (!json) return undefined;
    const parsed: unknown = JSON.parse(json);
    const picks =
        parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
            ? Object.entries(parsed)
            : null;
    if (!picks || picks.some(([, value]) => typeof value !== "string")) {
        throw new Error("Expected a JSON object of option picks");
    }
    return picks.length > 0 ? (Object.fromEntries(picks) as ToolOptionValues) : undefined;
};

/**
 * What to create for a launch request. Prompts and positions are carried over
 * as given; a request without them yields a blank chart of the tool. Option
 * picks go on a logit-lens or activation-patching config, the tools that take
 * options. Deploy launches create an empty chart pinned to the model (gpt2
 * when none is given) so it shows that model's deploying state. Throws on
 * malformed position or option JSON.
 */
export function planChartLaunch(request: ChartLaunchRequest): ChartLaunchPlan {
    const tool = launchTool(request.tool);
    const deploy = request.deploy === "true";
    const model = request.model || (deploy ? "openai-community/gpt2" : "");
    const options = parseOptions(request.options);

    if (tool === "activation-patching") {
        return {
            type: tool,
            data: {
                model,
                srcPrompt: deploy ? "" : (request.srcPrompt ?? ""),
                tgtPrompt: deploy ? "" : (request.tgtPrompt ?? ""),
                srcPos: deploy ? [] : parsePositions<SourcePosition>(request.srcPos),
                tgtPos: deploy ? [] : parsePositions<number>(request.tgtPos),
                tgtFreeze: deploy ? [] : parsePositions<number>(request.tgtFreeze),
                ...(options && { options }),
            },
        };
    }

    if (tool === "patch-lens") {
        const sourcePrompt = request.srcPrompt ?? request.prompt ?? "";
        const targetPrompt = request.tgtPrompt ?? "";
        return {
            type: tool,
            data: {},
            chartData:
                !deploy && (sourcePrompt || targetPrompt)
                    ? { sourcePrompt, targetPrompt }
                    : undefined,
        };
    }

    const data = {
        model,
        prompt: deploy ? "" : (request.prompt ?? ""),
        topk: 5,
        includeEntropy: false,
    };
    if (tool === "logit-lens")
        return { type: tool, data: { ...data, ...(options && { options }) } };
    return { type: tool, data };
}

/**
 * Whether a plan asks for nothing but a tool (and maybe a model and option
 * picks): no prompt, token positions or patch-lens prompts. Such a launch
 * reuses an untouched chart with the same config rather than adding another
 * (`createChartFromLaunch`).
 */
export function isBlankPlan(plan: ChartLaunchPlan): boolean {
    switch (plan.type) {
        case "activation-patching":
            return (
                !plan.data.srcPrompt &&
                !plan.data.tgtPrompt &&
                plan.data.srcPos.length === 0 &&
                plan.data.tgtPos.length === 0 &&
                plan.data.tgtFreeze.length === 0
            );
        case "patch-lens":
            return !plan.chartData;
        default:
            return !plan.data.prompt;
    }
}
