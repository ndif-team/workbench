import { getSessionUser, redirectWorkshopParticipant } from "@/lib/auth/user";
import { WorkspaceGrid } from "./components/WorkspaceGrid";

/** All workspaces (folders). A workshop participant goes to their workshop instead. */
export default async function WorkspacesPage() {
    await redirectWorkshopParticipant(await getSessionUser());
    return <WorkspaceGrid />;
}
