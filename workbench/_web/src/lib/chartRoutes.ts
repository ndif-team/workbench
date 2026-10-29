import { normalizeToolType, toolTypes, type ToolType } from "@/types/charts";

/** Route segment of each tool's chart page under `/workbench/[workspaceId]/`. */
const TOOL_ROUTE_SEGMENT: Record<ToolType, string> = {
    "logit-lens": "logit-lens",
    jlens: "j-lens",
    "activation-patching": "activation-patching",
    "patch-lens": "patch-lens",
};

/** Whether a stored chart/config type belongs to a live tool. */
function isToolType(type: string | null | undefined): type is ToolType {
    return (toolTypes as readonly (string | null | undefined)[]).includes(type);
}

/** The tool whose chart pages live under a route segment, if any. */
export function toolForRouteSegment(segment: string): ToolType | undefined {
    return toolTypes.find((tool) => TOOL_ROUTE_SEGMENT[tool] === segment);
}

/** Chart page of a live tool. */
export function toolChartPath(workspaceId: string, chartId: string, tool: ToolType): string {
    return `/workbench/${workspaceId}/${TOOL_ROUTE_SEGMENT[normalizeToolType(tool)]}/${chartId}`;
}

/**
 * Page that opens a chart of any stored type. Charts of retired tools have no
 * page, so they open the workspace root, which redirects to its most recent
 * live chart.
 */
export function chartPath(
    workspaceId: string,
    chartId: string,
    toolType: string | null | undefined,
): string {
    const tool = normalizeToolType(toolType);
    return isToolType(tool)
        ? toolChartPath(workspaceId, chartId, tool)
        : `/workbench/${workspaceId}`;
}
