"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, FilePlus, Folder, LayoutGrid, List, Plus } from "lucide-react";
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
    rectSortingStrategy,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUpdateChartName } from "@/lib/api/chartApi";
import { useCreateDocument } from "@/lib/api/documentApi";
import { useWorkspaceWorkshop } from "@/lib/api/workshopApi";
import {
    useRenameWorkspace,
    useReorderWorkspaceItems,
    useWorkspaceLibrary,
    workspaceNameError,
} from "@/lib/api/workspaceApi";
import { reportPath } from "@/lib/chartRoutes";
import { cn } from "@/lib/utils";
import { useWorkspaceView, type WorkspaceView } from "@/stores/useWorkspaceView";
import type { ToolType } from "@/types/charts";
import type { LibraryItem, LibraryWorkspace } from "@/types/workspaces";
import { PageHeader } from "../../../components/shell/PageHeader";
import { InlineNameInput } from "../../../components/items/InlineNameInput";
import { NewItemMenu } from "../../../components/items/NewItemMenu";
import { SortableEntry } from "../../../components/SortableEntry";
import { WorkspaceActionsMenu } from "../../../components/items/WorkspaceActions";
import {
    EMPTY_WORKSPACE_TEXT,
    describeContents,
} from "../../../components/items/workspaceContents";
import { FolderItemCard, FolderItemCardSkeleton } from "./FolderItemCard";
import { FolderItemRow, FolderItemRowSkeleton } from "./FolderItemRow";

const itemKey = (item: LibraryItem) => `${item.kind}-${item.id}`;

const CARD_GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4";
/** The rows' own surface in the list view, the cards' surface. */
const LIST_SURFACE = "flex flex-col rounded border bg-secondary/80 p-1.5 dark:bg-secondary/50";

/**
 * One workspace (folder): its name (renamed in place), New chart / New
 * report in it, Delete, and its charts and reports in their saved order, as
 * a grid of preview cards or a list of rows (`useWorkspaceView`), reordered
 * by dragging an item's handle (or with the keyboard on the handle). A
 * workshop workspace can't be renamed or deleted.
 */
export function WorkspaceFolder({ workspaceId }: { workspaceId: string }) {
    const router = useRouter();
    const { data: library, isLoading } = useWorkspaceLibrary();
    const folder = library?.workspaces.find((w) => w.id === workspaceId);
    const { data: workshop } = useWorkspaceWorkshop(folder?.isWorkshop ? workspaceId : undefined);
    const [renamingTitle, setRenamingTitle] = useState(false);
    const renameHintId = useId();
    const contentsHeadingId = useId();
    const [renamingItemId, setRenamingItemId] = useState<string | null>(null);
    const { mutate: renameWorkspace } = useRenameWorkspace();
    const { mutate: renameChart } = useUpdateChartName();
    const { mutate: reorderItems } = useReorderWorkspaceItems();
    const createReport = useCreateDocument();
    const { view: savedView, setView } = useWorkspaceView();
    // The saved view is read from localStorage, so the server and the first
    // client render both draw the default.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const view = mounted ? savedView : "grid";

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
    /** "3 charts and 1 report"; empty while the folder is empty or loading. */
    const contents = folder ? describeContents(folder) : "";

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
                    <div className="flex min-w-0 items-baseline gap-2">
                        <Breadcrumb>
                            {renamingTitle && folder ? (
                                <InlineNameInput
                                    initialValue={folder.name}
                                    ariaLabel="Workspace name"
                                    validate={(name) =>
                                        workspaceNameError(library, name, workspaceId)
                                    }
                                    className="h-7 w-64 max-w-full px-2 text-sm font-medium"
                                    onDone={(name) => {
                                        setRenamingTitle(false);
                                        if (name && name !== folder.name) {
                                            renameWorkspace({ workspaceId, name });
                                        }
                                    }}
                                />
                            ) : folder?.isWorkshop ? (
                                <h1 className="min-w-0 truncate px-1 text-sm font-medium">
                                    {folder.name}
                                </h1>
                            ) : (
                                <>
                                    <h1 className="flex min-w-0">
                                        <button
                                            type="button"
                                            onClick={() => setRenamingTitle(true)}
                                            disabled={!folder}
                                            title={
                                                folder
                                                    ? `${folder.name} (click to rename)`
                                                    : undefined
                                            }
                                            aria-describedby={renameHintId}
                                            className="min-w-0 cursor-text truncate rounded-md px-1 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                        >
                                            {folder?.name ?? "\u00a0"}
                                        </button>
                                    </h1>
                                    <span id={renameHintId} className="sr-only">
                                        Click to rename
                                    </span>
                                </>
                            )}
                        </Breadcrumb>
                        {contents && !renamingTitle && (
                            <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
                                {contents}
                            </span>
                        )}
                    </div>
                }
                end={
                    folder && (
                        <>
                            {contents && (
                                <>
                                    <ViewToggle view={view} onChange={setView} />
                                    <Separator orientation="vertical" className="mx-1 h-5" />
                                </>
                            )}
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
                            {!folder.isWorkshop && (
                                <WorkspaceActionsMenu
                                    workspace={folder}
                                    variant="header"
                                    onRename={() => setRenamingTitle(true)}
                                    onDeleted={() => router.push("/workspaces")}
                                />
                            )}
                        </>
                    )
                }
            />

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
                <section aria-labelledby={contentsHeadingId}>
                    <h2 id={contentsHeadingId} className="sr-only">
                        Charts and reports
                    </h2>
                    {isLoading || !folder ? (
                        view === "grid" ? (
                            <div aria-hidden className={CARD_GRID}>
                                {Array.from({ length: 4 }, (_, i) => (
                                    <FolderItemCardSkeleton key={i} />
                                ))}
                            </div>
                        ) : (
                            <div aria-hidden className={LIST_SURFACE}>
                                {Array.from({ length: 5 }, (_, i) => (
                                    <FolderItemRowSkeleton key={i} />
                                ))}
                            </div>
                        )
                    ) : folder.items.length === 0 ? (
                        <EmptyFolder
                            folder={folder}
                            tools={tools}
                            onNewReport={newReport}
                            creatingReport={createReport.isPending}
                        />
                    ) : (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={onDragEnd}
                        >
                            <SortableContext
                                items={items.map(itemKey)}
                                strategy={
                                    view === "grid"
                                        ? rectSortingStrategy
                                        : verticalListSortingStrategy
                                }
                            >
                                <ul className={view === "grid" ? CARD_GRID : LIST_SURFACE}>
                                    {items.map((item) => {
                                        const Item =
                                            view === "grid" ? FolderItemCard : FolderItemRow;
                                        return (
                                            <li key={itemKey(item)}>
                                                <SortableEntry
                                                    id={itemKey(item)}
                                                    handleClassName={
                                                        view === "grid"
                                                            ? "left-1.5 top-1.5 h-6 translate-y-0"
                                                            : undefined
                                                    }
                                                >
                                                    <Item
                                                        item={item}
                                                        folder={folder}
                                                        workspaces={library?.workspaces ?? []}
                                                        renaming={renamingItemId === item.id}
                                                        onRenameStart={() =>
                                                            setRenamingItemId(item.id)
                                                        }
                                                        onRenameEnd={(name) => {
                                                            setRenamingItemId(null);
                                                            if (name) {
                                                                renameChart({
                                                                    chartId: item.id,
                                                                    name,
                                                                });
                                                            }
                                                        }}
                                                    />
                                                </SortableEntry>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </SortableContext>
                        </DndContext>
                    )}
                </section>
            </div>
        </div>
    );
}

/** Grid or list, as a pair of pressed-state icon buttons. */
function ViewToggle({
    view,
    onChange,
}: {
    view: WorkspaceView;
    onChange: (view: WorkspaceView) => void;
}) {
    const options = [
        { value: "grid", label: "Grid", Icon: LayoutGrid },
        { value: "list", label: "List", Icon: List },
    ] as const;
    return (
        <div role="group" aria-label="Layout" className="flex items-center gap-0.5">
            {options.map(({ value, label, Icon }) => (
                <Tooltip key={value}>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label={label}
                            aria-pressed={view === value}
                            onClick={() => onChange(value)}
                            className={cn(
                                "size-7 text-muted-foreground",
                                view === value && "bg-accent text-foreground dark:bg-accent/50",
                            )}
                        >
                            <Icon />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{label}</TooltipContent>
                </Tooltip>
            ))}
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

/** An empty workspace's panel body: what fills it, with New chart and New report right there. */
function EmptyFolder({
    folder,
    tools,
    onNewReport,
    creatingReport,
}: {
    folder: LibraryWorkspace;
    tools?: readonly ToolType[];
    onNewReport: () => void;
    creatingReport: boolean;
}) {
    return (
        <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
            <div className="flex size-10 items-center justify-center rounded border bg-background">
                <Folder className="size-4 text-muted-foreground" />
            </div>
            <div className="flex max-w-sm flex-col gap-1">
                <p className="break-words text-sm font-medium">{folder.name} is empty</p>
                <p className="text-sm text-muted-foreground">{EMPTY_WORKSPACE_TEXT}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
                <NewItemMenu workspaceId={folder.id} tools={tools}>
                    <Button variant="outline" size="sm">
                        <Plus />
                        New chart
                        <ChevronDown className="size-3.5 text-muted-foreground" />
                    </Button>
                </NewItemMenu>
                <Button variant="outline" size="sm" onClick={onNewReport} disabled={creatingReport}>
                    <FilePlus />
                    New report
                </Button>
            </div>
        </div>
    );
}
