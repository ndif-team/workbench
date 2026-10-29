"use client";

import type { ComponentType, DragEvent, ReactNode } from "react";
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

/**
 * One look for every sidebar row: a full-width link with the ghost Button's
 * hover and focus ring. The hover lives on the row (`group/row`) so it stays
 * lit while the pointer is on the row's actions button.
 */
const rowLink = (active: boolean, className?: string) =>
    cn(
        "flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-sm whitespace-nowrap outline-none transition-colors",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        active
            ? "bg-primary/10 font-medium"
            : "group-hover/row:bg-accent group-has-[[data-state=open]]/row:bg-accent dark:group-hover/row:bg-accent/50 dark:group-has-[[data-state=open]]/row:bg-accent/50",
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
                <Icon className={cn("text-muted-foreground", active && "text-primary")} />
                {label}
            </Link>
        </div>
    );
}

/** A section title with an optional action at its right. */
export function SidebarSectionHeader({ title, action }: { title: string; action?: ReactNode }) {
    return (
        <div className="flex h-7 items-center justify-between pl-2 pr-0.5">
            <h2 className="text-xs font-medium text-muted-foreground">{title}</h2>
            {action}
        </div>
    );
}

/** A folder's items, hung from a guide line under its chevron. */
export function SidebarFolderItems({ children }: { children: ReactNode }) {
    return <div className="ml-3.5 flex flex-col border-l">{children}</div>;
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
                    <div className="size-4 shrink-0 rounded-sm bg-muted animate-pulse" />
                    <div
                        className={cn(
                            "h-3 rounded-sm bg-muted animate-pulse",
                            widths[i % widths.length],
                        )}
                    />
                </div>
            ))}
        </div>
    );
}

/** A workspace (folder): its chevron expands it in place, its name opens its page. */
export function SidebarFolderRow({
    name,
    href,
    count,
    expanded,
    active,
    isWorkshop,
    onToggle,
}: {
    name: string;
    href: string;
    count: number;
    expanded: boolean;
    active: boolean;
    isWorkshop: boolean;
    onToggle: () => void;
}) {
    const FolderIcon = isWorkshop ? GraduationCap : expanded ? FolderOpen : Folder;
    return (
        <div className="group/row relative">
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onToggle}
                aria-expanded={expanded}
                aria-label={`${expanded ? "Collapse" : "Expand"} ${name}`}
                className="absolute left-1 top-1/2 size-5 -translate-y-1/2 rounded-sm text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent"
            >
                <ChevronRight
                    className={cn("size-3.5 transition-transform", expanded && "rotate-90")}
                />
            </Button>
            <Link
                href={href}
                aria-current={active ? "page" : undefined}
                title={name}
                className={rowLink(active, "pl-7")}
            >
                <FolderIcon className={cn("text-muted-foreground", active && "text-primary")} />
                <span className="min-w-0 flex-1 truncate text-left">{name}</span>
                <span className="text-xs font-normal tabular-nums text-muted-foreground">
                    {count}
                </span>
            </Link>
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
              e.dataTransfer.setData("application/x-chart", dragPayload);
              e.dataTransfer.effectAllowed = "copy";
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
                className={rowLink(active, cn("pr-8", nested && "pl-3.5"))}
            >
                <Icon
                    className={cn(
                        "size-4 shrink-0 text-muted-foreground",
                        active && "text-primary",
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
