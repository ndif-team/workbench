import { requireUserId } from "@/lib/auth/user";
import { WorkspaceList } from "./components/WorkspaceList";

export const dynamic = "force-dynamic";

/** All workspaces. Temporary: the workspace list as it was on the old /workbench page. */
export default async function WorkspacesPage() {
    const userId = await requireUserId();
    return (
        <div className="size-full overflow-auto px-3 md:px-6 pb-6">
            <WorkspaceList userId={userId} />
        </div>
    );
}
