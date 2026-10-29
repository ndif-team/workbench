"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useWorkspaceScope } from "@/components/providers/WorkspaceScopeProvider";
import { cn } from "@/lib/utils";
import { AppSidebar } from "./AppSidebar";
import { writeSidebarCollapsed } from "./sidebarCookie";

type ShellSidebarState = {
    /** Whether the desktop sidebar is the slim rail. */
    collapsed: boolean;
    toggleCollapsed: () => void;
    /** Opens the sidebar drawer (mobile). */
    openDrawer: () => void;
    /** Closes the drawer, e.g. after navigating from it. */
    closeDrawer: () => void;
};

const ShellSidebarContext = createContext<ShellSidebarState | null>(null);

/** The shell's sidebar controls, for page headers (drawer trigger) and the sidebar itself. */
export function useShellSidebar(): ShellSidebarState {
    const value = useContext(ShellSidebarContext);
    if (!value) throw new Error("useShellSidebar must be used inside AppShell");
    return value;
}

/**
 * The app shell: the persistent left sidebar (a rail when collapsed; a drawer
 * on mobile) beside the page. The collapsed preference persists in a cookie
 * (`sidebarCookie.ts`).
 * A workshop workspace gets its focused sidebar instead, which starts as the
 * rail every time a workshop is entered and doesn't touch the preference.
 */
export function AppShell({
    defaultCollapsed,
    children,
}: {
    defaultCollapsed: boolean;
    children: ReactNode;
}) {
    const scope = useWorkspaceScope();
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(defaultCollapsed);
    const [workshopExpandedIn, setWorkshopExpandedIn] = useState<string | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerPath, setDrawerPath] = useState(pathname);

    // Navigating from inside the drawer closes it.
    if (drawerPath !== pathname) {
        setDrawerPath(pathname);
        setDrawerOpen(false);
    }

    const workshopWorkspaceId = scope?.workshopId ? scope.workspaceId : null;
    const effectiveCollapsed = workshopWorkspaceId
        ? workshopExpandedIn !== workshopWorkspaceId
        : collapsed;

    const toggleCollapsed = useCallback(() => {
        if (workshopWorkspaceId) {
            setWorkshopExpandedIn((current) =>
                current === workshopWorkspaceId ? null : workshopWorkspaceId,
            );
            return;
        }
        setCollapsed((current) => {
            writeSidebarCollapsed(!current);
            return !current;
        });
    }, [workshopWorkspaceId]);

    const value = useMemo<ShellSidebarState>(
        () => ({
            collapsed: effectiveCollapsed,
            toggleCollapsed,
            openDrawer: () => setDrawerOpen(true),
            closeDrawer: () => setDrawerOpen(false),
        }),
        [effectiveCollapsed, toggleCollapsed],
    );

    return (
        <ShellSidebarContext.Provider value={value}>
            <div className="flex h-screen bg-gradient-to-tr from-background dark:to-primary/15 to-primary/30">
                <aside
                    aria-label="Sidebar"
                    className={cn(
                        "hidden shrink-0 md:flex md:flex-col",
                        effectiveCollapsed ? "w-12" : "w-64",
                    )}
                >
                    <AppSidebar variant={effectiveCollapsed ? "rail" : "expanded"} />
                </aside>
                <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
                    <SheetContent className="md:hidden">
                        <SheetTitle className="sr-only">Sidebar</SheetTitle>
                        <SheetDescription className="sr-only">
                            Your charts, reports and workspaces
                        </SheetDescription>
                        <AppSidebar variant="drawer" />
                    </SheetContent>
                </Sheet>
                <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
            </div>
        </ShellSidebarContext.Provider>
    );
}
