import type { LibraryItem, LibraryWorkspace } from "@/types/workspaces";
import { itemLabel } from "../../components/items/itemLabel";

type WorkspaceMatch = {
    workspace: LibraryWorkspace;
    /** Its items whose label holds the query; empty when only its name does, or with no query. */
    items: LibraryItem[];
};

/**
 * The workspaces whose name, or the label of one of their charts, chats or
 * reports (a chat's name), holds `query` (ignoring case), in their order; all
 * of them for a blank query. Placeholder labels ("Untitled chart", "New
 * chat") don't count as a match.
 */
export function searchWorkspaces(workspaces: LibraryWorkspace[], query: string): WorkspaceMatch[] {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return workspaces.map((workspace) => ({ workspace, items: [] }));
    const holds = (text: string) => text.toLocaleLowerCase().includes(needle);
    return workspaces.flatMap((workspace) => {
        const items = workspace.items.filter((item) => {
            const label = itemLabel(item);
            return !label.placeholder && holds(label.text);
        });
        return holds(workspace.name) || items.length > 0 ? [{ workspace, items }] : [];
    });
}
