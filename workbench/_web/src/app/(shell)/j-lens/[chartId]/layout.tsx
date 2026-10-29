import { ChartWorkspaceScope } from "@/app/(shell)/components/WorkspaceScopes";

export default async function JLensChartLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ chartId: string }>;
}) {
    const { chartId } = await params;
    return <ChartWorkspaceScope chartId={chartId}>{children}</ChartWorkspaceScope>;
}
