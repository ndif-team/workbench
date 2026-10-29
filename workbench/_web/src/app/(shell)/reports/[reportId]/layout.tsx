import { ReportWorkspaceScope } from "@/app/(shell)/components/WorkspaceScopes";

export default async function ReportLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ reportId: string }>;
}) {
    const { reportId } = await params;
    return <ReportWorkspaceScope reportId={reportId}>{children}</ReportWorkspaceScope>;
}
