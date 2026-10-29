"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { Boxes, ChevronDown, FolderClosed, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CreateWorkspaceDialog } from "@/components/CreateWorkspaceDialog";
import { useWorkspaceLibrary } from "@/lib/api/workspaceApi";
import { useUpdateChartName } from "@/lib/api/chartApi";
import { workspacePath } from "@/lib/chartRoutes";
import { useSidebarFolders } from "@/stores/useSidebarFolders";
import type { LibraryItem, LibraryWorkspace } from "@/types/workspaces";
import { ItemActionsMenu } from "../items/ItemActionsMenu";
import { NewItemMenu } from "../items/NewItemMenu";
import { chartName, itemIcon, itemLabel, itemPath } from "../items/itemLabel";
import { useDeployStateOf } from "../useDeployStateOf";
import {
    SidebarEmpty,
    SidebarFolderItems,
    SidebarFolderRow,
    SidebarItemRow,
    SidebarNavLink,
    SidebarRowsSkeleton,
    SidebarSectionHeader,
} from "./SidebarRows";
import { inFolderOrder } from "./folderOrder";

/**
 * The global sidebar's body (expanded and in the mobile drawer): New chart,
 * the Models and Workspaces pages, the workspace folders with their items,
 * and the charts and reports that aren't in a folder, newest first.
 */
export function LibrarySidebar() {
    const pathname = usePathname();
    const params = useParams<{ chartId?: string; reportId?: string; workspaceId?: string }>();
    const activeItemId = params.chartId ?? params.reportId ?? null;

    const { data: library, isLoading, isError } = useWorkspaceLibrary();
    const expanded = useSidebarFolders((s) => s.expanded);
    const toggleFolder = useSidebarFolders((s) => s.toggle);
    const expandFolder = useSidebarFolders((s) => s.expand);
    const pruneFolders = useSidebarFolders((s) => s.prune);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [creatingWorkspace, setCreatingWorkspace] = useState(false);
    const { mutate: renameChart } = useUpdateChartName();
    const deployStateOf = useDeployStateOf();

    const folders = useMemo(() => inFolderOrder(library?.workspaces ?? []), [library?.workspaces]);

    // Open the folder holding the item on screen, so the active row is visible.
    const activeFolderId = useMemo(() => {
        if (!activeItemId) return null;
        return folders.find((w) => w.items.some((i) => i.id === activeItemId))?.id ?? null;
    }, [folders, activeItemId]);
    useEffect(() => {
        if (activeFolderId) expandFolder(activeFolderId);
    }, [activeFolderId, expandFolder]);

    useEffect(() => {
        if (library) pruneFolders(library.workspaces.map((w) => w.id));
    }, [library, pruneFolders]);

    const renderItem = (item: LibraryItem, folder: LibraryWorkspace | null) => {
        const label = itemLabel(item);
        const isChart = item.kind === "chart";
        return (
            <SidebarItemRow
                key={`${item.kind}-${item.id}`}
                href={itemPath(item)}
                label={label.text}
                placeholder={label.placeholder}
                Icon={itemIcon(item)}
                active={item.id === activeItemId}
                nested={!!folder}
                deployState={isChart ? deployStateOf(item) : null}
                dragPayload={
                    isChart
                        ? JSON.stringify({ chartId: item.id, chartType: item.toolType })
                        : undefined
                }
                renaming={renamingId === item.id}
                renameValue={isChart ? chartName(item.name) : ""}
                onRename={(name) => renameChart({ chartId: item.id, name })}
                onRenameEnd={() => setRenamingId(null)}
                actions={
                    folder?.isWorkshop ? null : (
                        <ItemActionsMenu
                            item={item}
                            workspaces={folders}
                            folder={folder}
                            active={item.id === activeItemId}
                            onRename={isChart ? () => setRenamingId(item.id) : undefined}
                        />
                    )
                }
            />
        );
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-col gap-0.5 px-2 pb-2">
                <NewItemMenu reportWorkspaceId={library?.defaultWorkspaceId}>
                    <Button variant="outline" className="mb-1.5 w-full justify-start gap-2 px-2">
                        <Plus className="text-muted-foreground" />
                        New chart
                        <ChevronDown className="ml-auto size-3.5 text-muted-foreground" />
                    </Button>
                </NewItemMenu>
                <SidebarNavLink
                    href="/models"
                    label="Models"
                    Icon={Boxes}
                    active={pathname === "/models"}
                />
                <SidebarNavLink
                    href="/workspaces"
                    label="Workspaces"
                    Icon={FolderClosed}
                    active={pathname === "/workspaces"}
                />
            </div>

            <nav
                aria-label="Charts and workspaces"
                className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto border-t px-2 pb-3 pt-3"
            >
                {isLoading ? (
                    <>
                        <section>
                            <SidebarSectionHeader title="Workspaces" />
                            <SidebarRowsSkeleton rows={2} />
                        </section>
                        <section>
                            <SidebarSectionHeader title="Charts" />
                            <SidebarRowsSkeleton rows={6} />
                        </section>
                    </>
                ) : isError || !library ? (
                    <SidebarEmpty>
                        Couldn&apos;t load your charts. Reload the page to retry.
                    </SidebarEmpty>
                ) : (
                    <>
                        <section aria-label="Workspaces">
                            <SidebarSectionHeader
                                title="Workspaces"
                                action={
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setCreatingWorkspace(true)}
                                        aria-label="New workspace"
                                        title="New workspace"
                                        className="size-6 rounded-sm text-muted-foreground hover:text-foreground"
                                    >
                                        <Plus className="size-3.5" />
                                    </Button>
                                }
                            />
                            {folders.length === 0 ? (
                                <SidebarEmpty>
                                    Group related charts and reports into a workspace.
                                </SidebarEmpty>
                            ) : (
                                <ul className="flex flex-col">
                                    {folders.map((folder) => {
                                        const isOpen = expanded.includes(folder.id);
                                        return (
                                            <li key={folder.id}>
                                                <SidebarFolderRow
                                                    name={folder.name}
                                                    href={workspacePath(folder.id)}
                                                    count={folder.items.length}
                                                    expanded={isOpen}
                                                    active={params.workspaceId === folder.id}
                                                    isWorkshop={folder.isWorkshop}
                                                    onToggle={() => toggleFolder(folder.id)}
                                                />
                                                {isOpen && (
                                                    <SidebarFolderItems>
                                                        {folder.items.length === 0 ? (
                                                            <p className="py-1.5 pl-3.5 pr-2 text-xs text-muted-foreground">
                                                                Move charts here from their menu.
                                                            </p>
                                                        ) : (
                                                            folder.items.map((item) =>
                                                                renderItem(item, folder),
                                                            )
                                                        )}
                                                    </SidebarFolderItems>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </section>

                        <section aria-label="Charts">
                            <SidebarSectionHeader title="Charts" />
                            {library.defaultItems.length === 0 ? (
                                <SidebarEmpty>Charts you create land here.</SidebarEmpty>
                            ) : (
                                <div className="flex flex-col">
                                    {library.defaultItems.map((item) => renderItem(item, null))}
                                </div>
                            )}
                        </section>
                    </>
                )}
            </nav>

            <CreateWorkspaceDialog open={creatingWorkspace} onOpenChange={setCreatingWorkspace} />
        </div>
    );
}
