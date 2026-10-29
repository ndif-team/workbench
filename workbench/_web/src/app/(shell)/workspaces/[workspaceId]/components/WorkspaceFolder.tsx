"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, FilePlus, Folder, Plus } from "lucide-react";
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { Button } from "@/components/ui/button";
import { useUpdateChartName } from "@/lib/api/chartApi";
import { useCreateDocument } from "@/lib/api/documentApi";
import { useWorkspaceWorkshop } from "@/lib/api/workshopApi";
import {
    useRenameWorkspace,
    useReorderWorkspaceItems,
    useWorkspaceLibrary,
} from "@/lib/api/workspaceApi";
import { reportPath } from "@/lib/chartRoutes";
import { cn } from "@/lib/utils";
import type { LibraryItem, LibraryWorkspace } from "@/types/workspaces";
import { PageHeader } from "../../../components/shell/PageHeader";
import { InlineNameInput } from "../../../components/items/InlineNameInput";
import { NewItemMenu } from "../../../components/items/NewItemMenu";
import { SortableEntry } from "../../../components/SortableEntry";
import { WorkspaceActionsMenu, describeContents } from "../../components/WorkspaceActions";
import { FolderItemRow, FolderItemRowSkeleton } from "./FolderItemRow";

const itemKey = (item: LibraryItem) => `${item.kind}-${item.id}`;

/**
 * One workspace (folder): its name (renamed in place), New chart / New
 * report in it, Delete, and its charts and reports in their saved order,
 * reordered by dragging a row's handle (or with the keyboard on the handle).
 */
export function WorkspaceFolder({ workspaceId }: { workspaceId: string }) {
    const router = useRouter();
    const { data: library, isLoading } = useWorkspaceLibrary();
    const folder = library?.workspaces.find((w) => w.id === workspaceId);
    const { data: workshop } = useWorkspaceWorkshop(folder?.isWorkshop ? workspaceId : undefined);
    const [renamingTitle, setRenamingTitle] = useState(false);
    const [renamingItemId, setRenamingItemId] = useState<string | null>(null);
    const { mutate: renameWorkspace } = useRenameWorkspace();
    const { mutate: renameChart } = useUpdateChartName();
    const { mutate: reorderItems } = useReorderWorkspaceItems();
    const createReport = useCreateDocument();

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const items = folder?.items ?? [];
    const onDragEnd = ({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return;
        const from = items.findIndex((i) => itemKey(i) === active.id);
        const to = items.findIndex((i) => itemKey(i) === over.id);
        if (from === -1 || to === -1) return;
        reorderItems({
            workspaceId,
            items: arrayMove(items, from, to).map((i) => ({ kind: i.kind, id: i.id })),
        });
    };

    const newReport = () =>
        createReport.mutate(workspaceId, {
            onSuccess: (report) => router.push(reportPath(report.id)),
            onError: () => toast.error("Couldn't create the report"),
        });

    const tools = workshop?.allowedTools;

    if (library && !folder) {
        return (
            <div className="flex size-full min-h-0 flex-col">
                <PageHeader start={<Breadcrumb />} />
                <div className="flex flex-1 items-center justify-center px-6 text-center">
                    <p className="text-sm text-muted-foreground">
                        This workspace no longer exists.{" "}
                        <Link href="/workspaces" className="text-foreground underline">
                            See all workspaces
                        </Link>
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex size-full min-h-0 flex-col">
            <PageHeader
                start={
                    <Breadcrumb>
                        {renamingTitle && folder ? (
                            <InlineNameInput
                                initialValue={folder.name}
                                ariaLabel="Workspace name"
                                className="h-7 w-64 max-w-full px-2 text-sm font-medium"
                                onDone={(name) => {
                                    setRenamingTitle(false);
                                    if (name && name !== folder.name) {
                                        renameWorkspace({ workspaceId, name });
                                    }
                                }}
                            />
                        ) : (
                            <h1 className="flex min-w-0">
                                <button
                                    type="button"
                                    onClick={() => setRenamingTitle(true)}
                                    disabled={!folder}
                                    title={folder ? `${folder.name} (click to rename)` : undefined}
                                    className="min-w-0 cursor-text truncate rounded-md px-1 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                >
                                    {folder?.name ?? "\u00a0"}
                                    <span className="sr-only">, rename</span>
                                </button>
                            </h1>
                        )}
                    </Breadcrumb>
                }
                end={
                    folder && (
                        <>
                            <NewItemMenu workspaceId={workspaceId} tools={tools} align="end">
                                <Button variant="outline" size="sm" aria-label="New chart">
                                    <Plus />
                                    <span className="hidden sm:inline">New chart</span>
                                    <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
                                </Button>
                            </NewItemMenu>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={newReport}
                                disabled={createReport.isPending}
                                aria-label="New report"
                            >
                                <FilePlus />
                                <span className="hidden sm:inline">New report</span>
                            </Button>
                            <WorkspaceActionsMenu
                                workspace={folder}
                                variant="header"
                                onRename={() => setRenamingTitle(true)}
                                onDeleted={() => router.push("/workspaces")}
                            />
                        </>
                    )
                }
            />

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                <section className="rounded border bg-secondary/80 dark:bg-secondary/50">
                    <div className="flex items-center justify-between border-b p-3">
                        <h2 className="pl-2 text-sm font-medium">Charts and reports</h2>
                        {folder && folder.items.length > 1 && !folder.isWorkshop && (
                            <span className="hidden text-xs text-muted-foreground sm:inline">
                                Drag a row by its handle to reorder
                            </span>
                        )}
                    </div>
                    {isLoading || !folder ? (
                        <div aria-hidden>
                            {Array.from({ length: 5 }, (_, i) => (
                                <FolderItemRowSkeleton key={i} />
                            ))}
                        </div>
                    ) : folder.items.length === 0 ? (
                        <EmptyFolder folder={folder} />
                    ) : (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={onDragEnd}
                        >
                            <SortableContext
                                items={items.map(itemKey)}
                                strategy={verticalListSortingStrategy}
                            >
                                <ul className="flex flex-col p-1.5">
                                    {items.map((item) => (
                                        <li key={itemKey(item)}>
                                            <SortableEntry id={itemKey(item)}>
                                                <FolderItemRow
                                                    item={item}
                                                    folder={folder}
                                                    workspaces={library?.workspaces ?? []}
                                                    renaming={renamingItemId === item.id}
                                                    onRenameStart={() => setRenamingItemId(item.id)}
                                                    onRenameEnd={(name) => {
                                                        setRenamingItemId(null);
                                                        if (name) {
                                                            renameChart({ chartId: item.id, name });
                                                        }
                                                    }}
                                                />
                                            </SortableEntry>
                                        </li>
                                    ))}
                                </ul>
                            </SortableContext>
                        </DndContext>
                    )}
                </section>
                {folder && folder.items.length > 0 && (
                    <p className="px-2 pt-2 text-xs text-muted-foreground">
                        {describeContents(folder)}
                    </p>
                )}
            </div>
        </div>
    );
}

/** "Workspaces ›" leading to the folder's own title. */
function Breadcrumb({ children }: { children?: React.ReactNode }) {
    return (
        <nav aria-label="Breadcrumb" className="-ml-1 flex min-w-0 items-center gap-1 text-sm">
            <Link
                href="/workspaces"
                className={cn(
                    "shrink-0 rounded-md px-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    children && "hidden sm:block",
                )}
            >
                Workspaces
            </Link>
            {children && (
                <>
                    <ChevronRight
                        aria-hidden
                        className="hidden size-3.5 shrink-0 text-muted-foreground sm:block"
                    />
                    {children}
                </>
            )}
        </nav>
    );
}

function EmptyFolder({ folder }: { folder: LibraryWorkspace }) {
    return (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="flex size-10 items-center justify-center rounded border bg-background">
                <Folder className="size-4 text-muted-foreground" />
            </div>
            <div className="flex max-w-sm flex-col gap-1">
                <p className="text-sm font-medium">{folder.name} is empty</p>
                <p className="text-sm text-muted-foreground">
                    Start a chart or report here with the buttons above, or file an existing one
                    with Move to workspace in its menu.
                </p>
            </div>
        </div>
    );
}
