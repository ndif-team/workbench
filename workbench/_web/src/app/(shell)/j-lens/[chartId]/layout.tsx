import { ChartWorkspaceScope } from "@/app/(shell)/components/WorkspaceScopes";
import { ItemPage } from "@/app/(shell)/components/items/ItemPage";

export default async function JLensChartLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ chartId: string }>;
}) {
    const { chartId } = await params;
    return (
        <ChartWorkspaceScope chartId={chartId}>
            <ItemPage item={{ kind: "chart", id: chartId }}>{children}</ItemPage>
        </ChartWorkspaceScope>
    );
}
