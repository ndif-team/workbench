"use client";

import type { ReactNode } from "react";
import { PanelLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useShellSidebar } from "./AppShell";

/**
 * The slim bar at the top of every shell page. `start` holds the page's
 * leading control or title; `center`, when given, is centered on the page
 * (an item's breadcrumb); `end` holds the page's actions. On mobile it leads
 * with the button that opens the sidebar drawer.
 */
export function PageHeader({
    start,
    center,
    end,
    className,
}: {
    start?: ReactNode;
    center?: ReactNode;
    end?: ReactNode;
    className?: string;
}) {
    const { openDrawer } = useShellSidebar();
    return (
        <header className={cn("flex h-12 shrink-0 items-center gap-2 px-3", className)}>
            <Button
                variant="ghost"
                size="icon"
                onClick={openDrawer}
                aria-label="Open sidebar"
                className="-ml-1 shrink-0 text-muted-foreground hover:text-foreground md:hidden"
            >
                <PanelLeft />
            </Button>
            <div
                className={cn(
                    "flex min-w-0 items-center gap-2",
                    center ? "md:flex-1 md:basis-0" : "flex-1",
                )}
            >
                {start}
            </div>
            {center && (
                <div className="flex min-w-0 flex-1 items-center justify-center md:max-w-[50%] md:flex-none">
                    {center}
                </div>
            )}
            <div
                className={cn(
                    "flex shrink-0 items-center justify-end gap-1",
                    center && "md:flex-1 md:basis-0",
                )}
            >
                {end}
            </div>
        </header>
    );
}

/** A page title for the header's `start` slot. */
export function PageTitle({ children }: { children: ReactNode }) {
    return <h1 className="truncate text-sm font-medium">{children}</h1>;
}
