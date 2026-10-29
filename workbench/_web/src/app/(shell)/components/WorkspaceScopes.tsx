import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { WorkspaceScopeProvider } from "@/components/providers/WorkspaceScopeProvider";
import { getChartWorkspaceScope, getReportWorkspaceScope } from "@/lib/queries/workspaceDb";

/** Server wrapper for a chart route's layout: provides the chart's workspace scope, 404s when the chart doesn't exist. */
export async function ChartWorkspaceScope({
    chartId,
    children,
}: {
    chartId: string;
    children: ReactNode;
}) {
    const scope = await getChartWorkspaceScope(chartId);
    if (!scope) notFound();
    return <WorkspaceScopeProvider scope={scope}>{children}</WorkspaceScopeProvider>;
}

/** Server wrapper for the report route's layout: provides the report's workspace scope, 404s when the report doesn't exist. */
export async function ReportWorkspaceScope({
    reportId,
    children,
}: {
    reportId: string;
    children: ReactNode;
}) {
    const scope = await getReportWorkspaceScope(reportId);
    if (!scope) notFound();
    return <WorkspaceScopeProvider scope={scope}>{children}</WorkspaceScopeProvider>;
}
