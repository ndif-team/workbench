import type { LogitLensData } from "nnsightful";
import { LogitLensConfigData } from "./logitLens";
import { JLensConfigData, JLensData } from "./jlens";
import { PatchLensChartData } from "./patchLens";
import { ActivationPatchingConfigData, ActivationPatchingData } from "./activationPatching";

export type ChartData = LogitLensData | JLensData | ActivationPatchingData | PatchLensChartData;
export type ConfigData =
    | LogitLensConfigData
    | JLensConfigData
    | ActivationPatchingConfigData
    | Record<string, never>; // patch-lens stores no config payload

export type ChartType = "logit-lens" | "jlens" | "activation-patching" | "patch-lens";

/** Every tool a chart can be created with. Config rows of any other type are
 * from retired tools and have no chart page. */
export const toolTypes = ["logit-lens", "jlens", "activation-patching", "patch-lens"] as const;
export type ToolType = (typeof toolTypes)[number];

/** Former tool type names that stored rows may still hold, mapped to their
 * current name. Writes always use the current name.
 *
 * Temporary: only until the stored rows are migrated from "lens2" to
 * "logit-lens". Then remove this and `normalizeToolType` with its call sites,
 * `normalizeWorkshopTools` and its callers (`withCurrentTools`, `validateTools`),
 * the legacy keys in `getMostRecentChartForWorkspace`'s `IN` list, and the alias
 * tests. */
export const LEGACY_TOOL_ALIASES: Readonly<Record<string, ToolType>> = { lens2: "logit-lens" };

/** A stored tool type under its current name. Other values, including retired
 * tools and null, pass through unchanged. */
export function normalizeToolType<T extends string | null | undefined>(type: T): T | ToolType {
    return type != null && Object.hasOwn(LEGACY_TOOL_ALIASES, type)
        ? LEGACY_TOOL_ALIASES[type]
        : type;
}

export type ChartMetadata = {
    id: string;
    name: string | null;
    chartType: ChartType | null;
    toolType: ToolType | null;
    position: number;
    createdAt: Date;
    updatedAt: Date;
    /** The chart's saved model (from its config). Lets the sidebar decide
     * whether the chart's model is still deploying. */
    model?: string | null;
    /** Whether the chart has a saved result. A chart with data shows it even if
     * its model later goes cold; only data-less charts get the deploying card. */
    hasData?: boolean;
};
