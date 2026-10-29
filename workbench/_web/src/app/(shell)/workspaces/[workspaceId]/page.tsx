import { notFound, redirect } from "next/navigation";

import { requireUserId } from "@/lib/auth/user";
import { getWorkspaceById } from "@/lib/queries/workspaceDb";
import { WorkspaceFolder } from "./components/WorkspaceFolder";

/**
 * One workspace (folder). The default workspace isn't a folder, so its id
 * goes to the workspaces page; another user's or a missing workspace is a 404.
 */
export default async function WorkspacePage({
    params,
}: {
    params: Promise<{ workspaceId: string }>;
}) {
    const { workspaceId } = await params;
    const [workspace, userId] = await Promise.all([getWorkspaceById(workspaceId), requireUserId()]);
    if (!workspace || workspace.userId !== userId) notFound();
    if (workspace.isDefault) redirect("/workspaces");
    return <WorkspaceFolder workspaceId={workspace.id} />;
}
