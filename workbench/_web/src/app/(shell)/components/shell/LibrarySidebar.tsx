"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { Boxes, ChevronDown, FolderClosed, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CreateWorkspaceDialog } from "@/components/CreateWorkspaceDialog";
import { findLibraryItem, useWorkspaceLibrary } from "@/lib/api/workspaceApi";
import { useUpdateChartName } from "@/lib/api/chartApi";
import { workspacePath } from "@/lib/chartRoutes";
import { useSidebarFolders } from "@/stores/useSidebarFolders";
import type { LibraryItem, LibraryWorkspace } from "@/types/workspaces";
import { ItemActionsMenu, useMoveItem } from "../items/ItemActionsMenu";
import { NewItemMenu } from "../items/NewItemMenu";
import { chartName, itemIcon, itemLabel, itemPath } from "../items/itemLabel";
import { recencyGroup } from "../items/formatUpdated";
import { EMPTY_WORKSPACE_TEXT } from "../items/workspaceContents";
import { useDeployStateOf } from "../useDeployStateOf";
import {
    SidebarEmpty,
    SidebarFolderItems,
    SidebarFolderRow,
    SidebarGroupLabel,
    SidebarItemRow,
    SidebarNavLink,
    SidebarRowsSkeleton,
    SidebarSectionAction,
    SidebarSectionHeader,
    SidebarShowMore,
} from "./SidebarRows";
import { inFolderOrder, visibleFolders } from "./folderOrder";

/** Splits a newest-first list into runs that share a recency group. */
const groupByRecency = (items: LibraryItem[]) => {
    const now = new Date();
    const groups: { label: string; items: LibraryItem[] }[] = [];
    for (const item of items) {
        const label = recencyGroup(item.updatedAt, now);
        const last = groups[groups.length - 1];
        if (last?.label === label) last.items.push(item);
        else groups.push({ label, items: [item] });
    }
    return groups;
};

/**
 * The global sidebar's body (expanded and in the mobile drawer): New chart,
 * the Models and Workspaces pages, the workspace folders with their items,
 * and the charts and reports that aren't in a folder, newest first. While
 * `pending` (the page's workspace isn't known yet) it doesn't read the
 * library and shows the list's skeleton.
 *
 * Both sections fold under their headers. Workspaces lists the most recently
 * updated folders (`visibleFolders`, always including the one holding the
 * item on screen, or the one whose page is open) until "Show N more" lists
 * them all. A chart row dropped on
 * another folder moves the chart there.
 */
export function LibrarySidebar({ pending = false }: { pending?: boolean }) {
    const pathname = usePathname();
    const params = useParams<{ chartId?: string; reportId?: string; workspaceId?: string }>();
    const activeItemId = params.chartId ?? params.reportId ?? null;

    const { data: library, isLoading, isError } = useWorkspaceLibrary({ enabled: !pending });
    const expanded = useSidebarFolders((s) => s.expanded);
    const toggleFolder = useSidebarFolders((s) => s.toggle);
    const expandFolder = useSidebarFolders((s) => s.expand);
    const pruneFolders = useSidebarFolders((s) => s.prune);
    const collapsedSections = useSidebarFolders((s) => s.collapsedSections);
    const toggleSection = useSidebarFolders((s) => s.toggleSection);
    const showAllFolders = useSidebarFolders((s) => s.showAllFolders);
    const setShowAllFolders = useSidebarFolders((s) => s.setShowAllFolders);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [creatingWorkspace, setCreatingWorkspace] = useState(false);
    const [draggedChartId, setDraggedChartId] = useState<string | null>(null);
    const { mutate: renameChart } = useUpdateChartName();
    const moveItem = useMoveItem();
    const deployStateOf = useDeployStateOf();
    const workspacesListId = useId();
    const chartsListId = useId();

    const folders = useMemo(() => inFolderOrder(library?.workspaces ?? []), [library?.workspaces]);
    const workspacesOpen = !collapsedSections.includes("workspaces");
    const chartsOpen = !collapsedSections.includes("charts");
    const draggedChart =
        library && draggedChartId ? findLibraryItem(library, "chart", draggedChartId) : undefined;

    /** Moves the chart being dragged into `folder`, or null when it can't go there. */
    const dropInto = (folder: LibraryWorkspace) =>
        draggedChart && !folder.isWorkshop && draggedChart.workspaceId !== folder.id
            ? () => {
                  const from = folders.find((w) => w.id === draggedChart.workspaceId) ?? null;
                  moveItem(draggedChart, folder, from);
                  expandFolder(folder.id);
                  setDraggedChartId(null);
              }
            : undefined;

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

    const cappedFolders = visibleFolders(folders, activeFolderId ?? params.workspaceId ?? null);
    const shownFolders = showAllFolders ? folders : cappedFolders;
    const hiddenFolderCount = folders.length - cappedFolders.length;

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
                onDragChange={(dragging) => setDraggedChartId(dragging ? item.id : null)}
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
                <NewItemMenu
                    reportWorkspaceId={library?.defaultWorkspaceId ?? undefined}
                    contentClassName="w-[var(--radix-dropdown-menu-trigger-width)]"
                >
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
                    active={pathname.startsWith("/workspaces")}
                />
            </div>

            <nav
                aria-label="Charts and workspaces"
                className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto border-t px-2 pb-3 pt-3"
            >
                {isLoading || pending ? (
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
                                expanded={workspacesOpen}
                                onToggle={() => toggleSection("workspaces")}
                                controls={workspacesListId}
                                action={
                                    <SidebarSectionAction
                                        label="New workspace"
                                        onClick={() => setCreatingWorkspace(true)}
                                    >
                                        <Plus className="size-3.5" />
                                    </SidebarSectionAction>
                                }
                            />
                            {workspacesOpen && (
                                <div id={workspacesListId}>
                                    {folders.length === 0 ? (
                                        <SidebarEmpty>
                                            Group related charts and reports into a workspace.
                                        </SidebarEmpty>
                                    ) : (
                                        <>
                                            <ul className="flex flex-col">
                                                {shownFolders.map((folder) => {
                                                    const isOpen = expanded.includes(folder.id);
                                                    return (
                                                        <li key={folder.id}>
                                                            <SidebarFolderRow
                                                                name={folder.name}
                                                                href={workspacePath(folder.id)}
                                                                count={folder.items.length}
                                                                expanded={isOpen}
                                                                active={
                                                                    params.workspaceId === folder.id
                                                                }
                                                                isWorkshop={folder.isWorkshop}
                                                                onToggle={() =>
                                                                    toggleFolder(folder.id)
                                                                }
                                                                onDropChart={dropInto(folder)}
                                                            />
                                                            {isOpen && (
                                                                <SidebarFolderItems>
                                                                    {folder.items.length === 0 ? (
                                                                        <p className="py-1.5 pl-3.5 pr-2 text-xs text-muted-foreground">
                                                                            {EMPTY_WORKSPACE_TEXT}
                                                                        </p>
                                                                    ) : (
                                                                        folder.items.map((item) =>
                                                                            renderItem(
                                                                                item,
                                                                                folder,
                                                                            ),
                                                                        )
                                                                    )}
                                                                </SidebarFolderItems>
                                                            )}
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                            {hiddenFolderCount > 0 && (
                                                <SidebarShowMore
                                                    hiddenCount={hiddenFolderCount}
                                                    showingAll={showAllFolders}
                                                    onToggle={() =>
                                                        setShowAllFolders(!showAllFolders)
                                                    }
                                                />
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </section>

                        <section aria-label="Charts">
                            <SidebarSectionHeader
                                title="Charts"
                                expanded={chartsOpen}
                                onToggle={() => toggleSection("charts")}
                                controls={chartsListId}
                            />
                            {chartsOpen && (
                                <div id={chartsListId}>
                                    {library.defaultItems.length === 0 ? (
                                        <SidebarEmpty>Charts you create land here.</SidebarEmpty>
                                    ) : (
                                        <div className="flex flex-col">
                                            {groupByRecency(library.defaultItems).map(
                                                (group, i, all) => (
                                                    <div
                                                        key={group.label}
                                                        className="flex flex-col"
                                                    >
                                                        {all.length > 1 && (
                                                            <SidebarGroupLabel>
                                                                {group.label}
                                                            </SidebarGroupLabel>
                                                        )}
                                                        {group.items.map((item) =>
                                                            renderItem(item, null),
                                                        )}
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                    )}
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
