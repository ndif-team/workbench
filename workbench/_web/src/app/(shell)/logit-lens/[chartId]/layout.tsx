import { TooltipProvider } from "@/components/ui/tooltip";
import { ChartWorkspaceScope } from "@/app/(shell)/components/WorkspaceScopes";

export default async function LogitLensChartLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ chartId: string }>;
}) {
    const { chartId } = await params;
    return (
        <ChartWorkspaceScope chartId={chartId}>
            <TooltipProvider>{children}</TooltipProvider>
        </ChartWorkspaceScope>
    );
}
