import { Lens2ConfigData, Lens2Data } from "./lens2";
import { JLensConfigData, JLensData } from "./jlens";
import { PatchLensChartData } from "./patchLens";
import { ActivationPatchingConfigData, ActivationPatchingData } from "./activationPatching";

export type ChartData = Lens2Data | JLensData | ActivationPatchingData | PatchLensChartData;
export type ConfigData =
    | Lens2ConfigData
    | JLensConfigData
    | ActivationPatchingConfigData
    | Record<string, never>; // patch-lens stores no config payload

export type ChartType = "lens2" | "jlens" | "activation-patching" | "patch-lens";

/** Every tool a chart can be created with. Config rows of any other type are
 * from retired tools and have no chart page. */
export const toolTypes = ["lens2", "jlens", "activation-patching", "patch-lens"] as const;
export type ToolType = (typeof toolTypes)[number];

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
