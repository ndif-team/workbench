import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { WorkspaceScopeProvider } from "@/components/providers/WorkspaceScopeProvider";
import {
    getChartWorkspaceScope,
    getChatWorkspaceScope,
    getReportWorkspaceScope,
} from "@/lib/queries/workspaceDb";

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

/** Server wrapper for a chat route's layout: provides the chat's workspace scope, 404s when the chat doesn't exist. */
export async function ChatWorkspaceScope({
    chatId,
    children,
}: {
    chatId: string;
    children: ReactNode;
}) {
    const scope = await getChatWorkspaceScope(chatId);
    if (!scope) notFound();
    return <WorkspaceScopeProvider scope={scope}>{children}</WorkspaceScopeProvider>;
}
