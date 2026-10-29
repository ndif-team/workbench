import type { LibraryWorkspace } from "@/types/workspaces";

/**
 * Folders in display order: the user's own folders first, workshop
 * workspaces after them, each group keeping the library's newest-first order.
 */
export function inFolderOrder(workspaces: readonly LibraryWorkspace[]): LibraryWorkspace[] {
    return [...workspaces].sort((a, b) => Number(a.isWorkshop) - Number(b.isWorkshop));
}
