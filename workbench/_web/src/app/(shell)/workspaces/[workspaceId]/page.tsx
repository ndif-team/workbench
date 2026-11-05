import { notFound, redirect } from "next/navigation";

import { redirectWorkshopParticipant, requireUser } from "@/lib/auth/user";
import { getWorkspaceById } from "@/lib/queries/workspaceDb";
import { WorkspaceFolder } from "./components/WorkspaceFolder";

/**
 * One workspace (folder). The default workspace isn't a folder, so its id
 * goes to the workspaces page; another user's or a missing workspace is a 404.
 * A workshop participant goes to their workshop instead.
 */
export default async function WorkspacePage({
    params,
}: {
    params: Promise<{ workspaceId: string }>;
}) {
    const { workspaceId } = await params;
    const user = await requireUser();
    await redirectWorkshopParticipant(user);
    const workspace = await getWorkspaceById(workspaceId);
    if (!workspace || workspace.userId !== user.id) notFound();
    if (workspace.isDefault) redirect("/workspaces");
    return <WorkspaceFolder workspaceId={workspace.id} />;
}
