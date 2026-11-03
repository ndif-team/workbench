"use client";

import { useState, type ComponentType, type DragEvent, type ReactNode } from "react";
import Link from "next/link";
import {
    AlertTriangle,
    ChevronRight,
    Cloud,
    Folder,
    FolderOpen,
    GraduationCap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DeployCardState } from "../DeployCard";
import { InlineNameInput } from "../items/InlineNameInput";

type IconType = ComponentType<{ className?: string }>;

/** The chart payload sidebar rows drag into a report editor or onto a folder. */
const CHART_DRAG_TYPE = "application/x-chart";

/**
 * One look for every sidebar row: a full-width link with the ghost Button's
 * hover and focus ring. The hover lives on the row (`group/row`) so it stays
 * lit while the pointer is on the row's actions button. The active row takes
 * the full accent fill (hover a lighter one), medium weight and a dark icon:
 * neutral, so blue stays for buttons and drop targets.
 */
const rowLink = (active: boolean, className?: string) =>
    cn(
        "relative flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-sm whitespace-nowrap outline-none transition-colors group-data-[variant=drawer]/sidebar:h-9",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        active
            ? "bg-accent font-medium"
            : "group-hover/row:bg-accent/60 group-has-[[data-state=open]]/row:bg-accent/60 dark:group-hover/row:bg-accent/50 dark:group-has-[[data-state=open]]/row:bg-accent/50",
        className,
    );

/** Top-level navigation (Models, Workspaces). */
export function SidebarNavLink({
    href,
    label,
    Icon,
    active,
}: {
    href: string;
    label: string;
    Icon: IconType;
    active: boolean;
}) {
    return (
        <div className="group/row">
            <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={rowLink(active, "h-8")}
            >
                <Icon className={cn("text-muted-foreground", active && "text-foreground")} />
                {label}
            </Link>
        </div>
    );
}

/**
 * A section title with an optional action at its right. With `onToggle` the
 * title is a disclosure button that folds the section (`controls` names the
 * region it shows and hides).
 */
export function SidebarSectionHeader({
    title,
    action,
    expanded = true,
    onToggle,
    controls,
}: {
    title: string;
    action?: ReactNode;
    expanded?: boolean;
    onToggle?: () => void;
    controls?: string;
}) {
    return (
        <div className="flex h-7 items-center justify-between pr-0.5 group-data-[variant=drawer]/sidebar:h-9">
            <h2 className="text-xs font-medium text-foreground">
                {onToggle ? (
                    <button
                        type="button"
                        onClick={onToggle}
                        aria-expanded={expanded}
                        aria-controls={controls}
                        className="flex h-7 items-center gap-1 rounded-md px-2 outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:hover:bg-accent/50 group-data-[variant=drawer]/sidebar:h-9"
                    >
                        {title}
                        <ChevronRight
                            aria-hidden
                            className={cn(
                                "size-3 text-muted-foreground transition-transform",
                                expanded && "rotate-90",
                            )}
                        />
                    </button>
                ) : (
                    <span className="px-2">{title}</span>
                )}
            </h2>
            {action}
        </div>
    );
}

/** A section's icon action (e.g. New workspace); a full touch target in the drawer. */
export function SidebarSectionAction({
    label,
    onClick,
    children,
}: {
    label: string;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClick}
            aria-label={label}
            title={label}
            className="size-6 text-muted-foreground hover:text-foreground group-data-[variant=drawer]/sidebar:size-8"
        >
            {children}
        </Button>
    );
}

/**
 * A sub-heading inside a section, e.g. a recency group of the Charts list.
 * Render each group in its own wrapper so the first one sits tight under the
 * section header.
 */
export function SidebarGroupLabel({ children }: { children: ReactNode }) {
    return (
        <h3 className="px-2 pb-0.5 pt-2 text-xs text-muted-foreground [:first-child>&]:pt-0.5">
            {children}
        </h3>
    );
}

/** A folder's items, hung from a guide line under its chevron. */
export function SidebarFolderItems({ children }: { children: ReactNode }) {
    return (
        <div className="ml-3.5 flex flex-col border-l group-data-[variant=drawer]/sidebar:ml-4">
            {children}
        </div>
    );
}

/** "Show N more" / "Show less" under a capped list, aligned with its rows' labels. */
export function SidebarShowMore({
    hiddenCount,
    showingAll,
    onToggle,
}: {
    hiddenCount: number;
    showingAll: boolean;
    onToggle: () => void;
}) {
    return (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="h-7 w-full justify-start gap-2 pl-7 pr-2 text-xs font-normal text-muted-foreground hover:text-foreground group-data-[variant=drawer]/sidebar:h-9 group-data-[variant=drawer]/sidebar:pl-9"
        >
            <span aria-hidden className="size-4 shrink-0" />
            {showingAll ? "Show less" : `Show ${hiddenCount} more`}
        </Button>
    );
}

/** Quiet explanatory text where a section has nothing to list. */
export function SidebarEmpty({ children }: { children: ReactNode }) {
    return <p className="px-2 py-1.5 text-xs text-muted-foreground">{children}</p>;
}

/** Placeholder rows while the library loads; shaped like item rows. */
export function SidebarRowsSkeleton({ rows = 6 }: { rows?: number }) {
    const widths = ["w-3/4", "w-1/2", "w-2/3", "w-3/5", "w-4/5", "w-1/2"];
    return (
        <div aria-hidden className="flex flex-col">
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex h-7 items-center gap-2 px-2">
                    <div className="size-4 shrink-0 rounded-sm bg-border animate-pulse" />
                    <div
                        className={cn(
                            "h-3 rounded-sm bg-border animate-pulse",
                            widths[i % widths.length],
                        )}
                    />
                </div>
            ))}
        </div>
    );
}

/**
 * A workspace (folder): its chevron expands it in place, its name opens its
 * page, and `actions` (when given) sits at its end, faintly visible like an
 * item row's. With `onDropChart` it takes a chart dragged from another
 * sidebar row (`CHART_DRAG_TYPE`), lighting up while one is held over it.
 * While `renaming`, the name becomes an input that saves on Enter or blur and
 * cancels on Escape.
 */
export function SidebarFolderRow({
    name,
    href,
    count,
    expanded,
    active,
    isWorkshop,
    onToggle,
    onDropChart,
    actions,
    renaming = false,
    onRename,
    onRenameEnd,
}: {
    name: string;
    href: string;
    count: number;
    expanded: boolean;
    active: boolean;
    isWorkshop: boolean;
    onToggle: () => void;
    onDropChart?: () => void;
    actions?: ReactNode;
    renaming?: boolean;
    onRename?: (name: string) => void;
    onRenameEnd?: () => void;
}) {
    const [dropping, setDropping] = useState(false);
    const FolderIcon = isWorkshop ? GraduationCap : expanded ? FolderOpen : Folder;
    const accepts = (e: DragEvent) =>
        !!onDropChart && e.dataTransfer.types.includes(CHART_DRAG_TYPE);

    if (renaming) {
        return (
            <div className="flex h-7 items-center gap-2 pl-7 pr-2 group-data-[variant=drawer]/sidebar:pl-9">
                <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                <InlineNameInput
                    initialValue={name}
                    ariaLabel="Workspace name"
                    placeholder="Workspace name"
                    className="h-6 min-w-0 flex-1 px-1.5"
                    onDone={(next) => {
                        onRenameEnd?.();
                        if (next && next !== name) onRename?.(next);
                    }}
                />
            </div>
        );
    }

    return (
        <div
            className="group/row relative"
            onDragOver={(e) => {
                if (!accepts(e)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDropping(true);
            }}
            onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
            }}
            onDrop={(e) => {
                setDropping(false);
                if (!accepts(e)) return;
                e.preventDefault();
                onDropChart?.();
            }}
        >
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onToggle}
                aria-expanded={expanded}
                aria-label={`${expanded ? "Collapse" : "Expand"} ${name}`}
                className="absolute left-0.5 top-1/2 z-10 size-6 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent group-data-[variant=drawer]/sidebar:left-0 group-data-[variant=drawer]/sidebar:size-8"
            >
                <ChevronRight
                    className={cn("size-3.5 transition-transform", expanded && "rotate-90")}
                />
            </Button>
            <Link
                href={href}
                aria-current={active ? "page" : undefined}
                title={name}
                className={rowLink(
                    active,
                    cn(
                        "pl-7 group-data-[variant=drawer]/sidebar:pl-9",
                        actions && "pr-8",
                        dropping && "bg-primary/10 ring-1 ring-inset ring-primary/60",
                    ),
                )}
            >
                <FolderIcon className={cn("text-muted-foreground", active && "text-foreground")} />
                <span className="min-w-0 flex-1 truncate text-left">{name}</span>
                <span className="text-xs font-normal tabular-nums text-muted-foreground">
                    {count}
                </span>
            </Link>
            {actions && (
                <div className="absolute right-0.5 top-1/2 -translate-y-1/2">{actions}</div>
            )}
        </div>
    );
}

const DEPLOY_STATE: Record<DeployCardState, { label: string; node: ReactNode }> = {
    cold: {
        label: "Model not deployed",
        node: <Cloud className="size-3.5 text-muted-foreground" />,
    },
    deploying: {
        label: "Deploying model",
        node: (
            <span className="brand-spinner inline-block size-3 motion-safe:animate-spin [animation-duration:1.4s]" />
        ),
    },
    failed: {
        label: "Deployment failed",
        node: <AlertTriangle className="size-3.5 text-destructive" />,
    },
};

/**
 * A chart or report: tool icon + label, the chart's deploy state when its
 * model isn't runnable, and an actions trigger that stays faintly visible.
 * Chart rows drag into a report editor (`dragPayload`). While `renaming`, the
 * label becomes an input that saves on Enter or blur and cancels on Escape.
 */
export function SidebarItemRow({
    href,
    label,
    placeholder,
    Icon,
    active,
    nested,
    deployState,
    dragPayload,
    onDragChange,
    actions,
    renaming,
    renameValue,
    onRename,
    onRenameEnd,
}: {
    href: string;
    label: string;
    placeholder: boolean;
    Icon: IconType;
    active: boolean;
    nested: boolean;
    deployState: DeployCardState | null;
    dragPayload?: string;
    /** Told when a drag of this row starts (true) and ends (false). */
    onDragChange?: (dragging: boolean) => void;
    actions: ReactNode;
    renaming: boolean;
    renameValue: string;
    onRename: (name: string) => void;
    onRenameEnd: () => void;
}) {
    if (renaming) {
        return (
            <div className={cn("flex h-7 items-center gap-2 px-2", nested && "pl-3.5")}>
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <InlineNameInput
                    initialValue={renameValue}
                    ariaLabel="Chart name"
                    placeholder="Untitled chart"
                    className="h-6 min-w-0 flex-1 px-1.5"
                    onDone={(name) => {
                        onRenameEnd();
                        if (name && name !== renameValue) onRename(name);
                    }}
                />
            </div>
        );
    }

    const onDragStart = dragPayload
        ? (e: DragEvent<HTMLAnchorElement>) => {
              e.dataTransfer.setData(CHART_DRAG_TYPE, dragPayload);
              e.dataTransfer.effectAllowed = "copyMove";
              onDragChange?.(true);
          }
        : undefined;

    return (
        <div className="group/row relative">
            <Link
                href={href}
                aria-current={active ? "page" : undefined}
                title={label}
                draggable={!!dragPayload}
                onDragStart={onDragStart}
                onDragEnd={dragPayload ? () => onDragChange?.(false) : undefined}
                className={rowLink(active, cn("pr-8", nested && "pl-3.5"))}
            >
                <Icon
                    className={cn(
                        "size-4 shrink-0 text-muted-foreground",
                        active && "text-foreground",
                    )}
                />
                <span
                    className={cn(
                        "min-w-0 flex-1 truncate text-left",
                        placeholder && "text-muted-foreground",
                    )}
                >
                    {label}
                </span>
                {deployState && (
                    <span
                        role="img"
                        aria-label={DEPLOY_STATE[deployState].label}
                        title={DEPLOY_STATE[deployState].label}
                        className="flex shrink-0 items-center"
                    >
                        {DEPLOY_STATE[deployState].node}
                    </span>
                )}
            </Link>
            <div className="absolute right-0.5 top-1/2 -translate-y-1/2">{actions}</div>
        </div>
    );
}
