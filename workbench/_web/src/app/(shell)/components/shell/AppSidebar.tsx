"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Boxes, FolderClosed, PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspaceScope } from "@/components/providers/WorkspaceScopeProvider";
import { useWorkspaceLibrary } from "@/lib/api/workspaceApi";
import { cn } from "@/lib/utils";
import ChartCardsSidebar from "../ChartCardsSidebar";
import { NewItemMenu } from "../items/NewItemMenu";
import { useShellSidebar } from "./AppShell";
import { LibrarySidebar } from "./LibrarySidebar";
import { SidebarFooter } from "./SidebarFooter";

type SidebarVariant = "expanded" | "rail" | "drawer";

/**
 * The shell's sidebar in one of three shapes: expanded, the collapsed rail,
 * or the mobile drawer. On a workshop workspace's chart it is the focused
 * workshop sidebar (`ChartCardsSidebar`) instead of the global one, so
 * participants keep the workshop's tools and never get the global New chart.
 * A chart or report page's scope only reaches the shell once the page has
 * mounted, so until then the global sidebar is `pending`: it shows its
 * skeleton and doesn't read the library (reading it creates a default
 * workspace, which a workshop participant should never get). `AppShell`
 * hides it on a workshop page's first paint.
 */
export function AppSidebar({ variant }: { variant: SidebarVariant }) {
    const scope = useWorkspaceScope();
    const params = useParams<{ chartId?: string; reportId?: string }>();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const onItemPage = !!(params.chartId || params.reportId);
    const mode = scope?.workshopId
        ? "workshop"
        : onItemPage && !scope && !mounted
          ? "pending"
          : "global";

    return (
        <div className="flex h-full min-h-0 flex-col">
            <SidebarHeader variant={variant} />
            {mode === "workshop" ? (
                <div className="flex min-h-0 flex-1 flex-col">
                    <ChartCardsSidebar collapsed={variant === "rail"} />
                </div>
            ) : variant === "rail" ? (
                <LibraryRail pending={mode === "pending"} />
            ) : (
                <LibrarySidebar pending={mode === "pending"} />
            )}
            <SidebarFooter orientation={variant === "rail" ? "column" : "row"} />
        </div>
    );
}

function SidebarHeader({ variant }: { variant: SidebarVariant }) {
    const { toggleCollapsed, closeDrawer } = useShellSidebar();

    if (variant === "rail") {
        return (
            <div className="flex h-12 shrink-0 items-center justify-center">
                <RailButton label="Expand sidebar" onClick={toggleCollapsed}>
                    <PanelLeftOpen />
                </RailButton>
            </div>
        );
    }

    return (
        <div className="flex h-12 shrink-0 items-center justify-between pl-4 pr-2">
            <Link
                href="/"
                className="rounded-sm bg-gradient-to-r from-primary via-purple-600 to-primary bg-clip-text text-lg font-bold text-transparent outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
                Workbench
            </Link>
            {variant === "drawer" ? (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={closeDrawer}
                    aria-label="Close sidebar"
                    className="text-muted-foreground hover:text-foreground"
                >
                    <X />
                </Button>
            ) : (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleCollapsed}
                            aria-label="Collapse sidebar"
                            className="text-muted-foreground hover:text-foreground"
                        >
                            <PanelLeftClose />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Collapse sidebar</TooltipContent>
                </Tooltip>
            )}
        </div>
    );
}

/** An icon button on the rail, labelled by a tooltip to its right. */
function RailButton({
    label,
    active = false,
    onClick,
    href,
    children,
}: {
    label: string;
    active?: boolean;
    onClick?: () => void;
    href?: string;
    children: React.ReactNode;
}) {
    const className = cn(
        "text-muted-foreground hover:text-foreground",
        active && "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
    );
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                {href ? (
                    <Button variant="ghost" size="icon" className={className} asChild>
                        <Link
                            href={href}
                            aria-label={label}
                            aria-current={active ? "page" : undefined}
                        >
                            {children}
                        </Link>
                    </Button>
                ) : (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClick}
                        aria-label={label}
                        className={className}
                    >
                        {children}
                    </Button>
                )}
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
    );
}

/** The global sidebar collapsed to a rail: New chart and the two pages. */
function LibraryRail({ pending }: { pending: boolean }) {
    const pathname = usePathname();
    const { data: library } = useWorkspaceLibrary({ enabled: !pending });
    return (
        <div className="flex flex-1 flex-col items-center gap-1">
            <NewItemMenu reportWorkspaceId={library?.defaultWorkspaceId} side="right">
                <Button
                    variant="outline"
                    size="icon"
                    aria-label="New chart"
                    className="text-muted-foreground hover:text-foreground"
                >
                    <Plus />
                </Button>
            </NewItemMenu>
            <Separator className="my-1.5 w-6" />
            <RailButton href="/models" label="Models" active={pathname === "/models"}>
                <Boxes />
            </RailButton>
            <RailButton
                href="/workspaces"
                label="Workspaces"
                active={pathname.startsWith("/workspaces")}
            >
                <FolderClosed />
            </RailButton>
        </div>
    );
}
