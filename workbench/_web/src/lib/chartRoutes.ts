import { normalizeToolType, toolTypes, type ToolType } from "@/types/charts";

/** Route segment of each tool's chart page, `/<segment>/[chartId]`. */
const TOOL_ROUTE_SEGMENT: Record<ToolType, string> = {
    "logit-lens": "logit-lens",
    jlens: "j-lens",
    "activation-patching": "activation-patching",
    "patch-lens": "patch-lens",
    "algorithm-hypothesis": "algorithm-hypothesis",
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
export function toolChartPath(chartId: string, tool: ToolType): string {
    return `/${TOOL_ROUTE_SEGMENT[normalizeToolType(tool)]}/${chartId}`;
}

/**
 * Page that opens a chart of any stored type. Charts of retired tools have no
 * page, so they open their workspace when the caller knows it (which
 * redirects to its most recent live chart), else Home.
 */
export function chartPath(
    chartId: string,
    toolType: string | null | undefined,
    workspaceId?: string | null,
): string {
    const tool = normalizeToolType(toolType);
    if (isToolType(tool)) return toolChartPath(chartId, tool);
    return workspaceId ? openWorkspacePath(workspaceId) : "/";
}

/** Report editor. */
export function reportPath(reportId: string): string {
    return `/reports/${reportId}`;
}

/** A workspace's (folder's) page. */
export function workspacePath(workspaceId: string): string {
    return `/workspaces/${workspaceId}`;
}

/** Opens a workspace on its most recent live chart, creating one when it has none. */
export function openWorkspacePath(workspaceId: string): string {
    return `/workbench/${workspaceId}`;
}

/**
 * Creates a chart from launch parameters (`tool`, `model`, `prompt`, …; see
 * lib/chartLaunch.ts) in the default workspace, or in `workspaceId` when given,
 * then opens it.
 */
export function newChartPath(params: ConstructorParameters<typeof URLSearchParams>[0]): string {
    const query = new URLSearchParams(params).toString();
    return query ? `/new?${query}` : "/new";
}
