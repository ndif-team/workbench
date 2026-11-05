import { ReportWorkspaceScope } from "@/app/(shell)/components/WorkspaceScopes";
import { ItemPage } from "@/app/(shell)/components/items/ItemPage";

export default async function ReportLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ reportId: string }>;
}) {
    const { reportId } = await params;
    return (
        <ReportWorkspaceScope reportId={reportId}>
            <ItemPage item={{ kind: "report", id: reportId }}>{children}</ItemPage>
        </ReportWorkspaceScope>
    );
}
