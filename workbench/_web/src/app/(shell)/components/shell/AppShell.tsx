"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type CSSProperties,
    type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useWorkspaceScope } from "@/components/providers/WorkspaceScopeProvider";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import type { WorkshopParticipant } from "@/lib/workshop";
import { AppSidebar } from "./AppSidebar";
import { SidebarResizeHandle } from "./SidebarResizeHandle";
import { writeSidebarCollapsed, writeSidebarWidth } from "./sidebarCookie";

type ShellSidebarState = {
    /** Whether the desktop sidebar is the slim rail. */
    collapsed: boolean;
    /** The desktop sidebar's width when expanded, in px. */
    width: number;
    toggleCollapsed: () => void;
    /** Opens the sidebar drawer (mobile). */
    openDrawer: () => void;
    /** Closes the drawer, e.g. after navigating from it. */
    closeDrawer: () => void;
    /** Set when the signed-in user is an anonymous workshop participant, kept in their workshop. */
    workshopParticipant: WorkshopParticipant | null;
};

const ShellSidebarContext = createContext<ShellSidebarState | null>(null);

/** The shell's sidebar controls, for page headers (drawer trigger) and the sidebar itself. */
export function useShellSidebar(): ShellSidebarState {
    const value = useContext(ShellSidebarContext);
    if (!value) throw new Error("useShellSidebar must be used inside AppShell");
    return value;
}

/** Where the signed-in anonymous workshop participant is kept; null for everyone else. */
export function useWorkshopParticipant(): WorkshopParticipant | null {
    return useContext(ShellSidebarContext)?.workshopParticipant ?? null;
}

/**
 * The app shell: the persistent left sidebar (a rail when collapsed; a drawer
 * on mobile) beside the page. Expanded, its right edge drags to resize it.
 * The collapsed preference and the width persist in cookies
 * (`sidebarCookie.ts`); a first visit starts with the rail.
 * A workshop workspace gets its focused sidebar instead, which starts as the
 * rail every time a workshop is entered and doesn't touch the preference. So
 * does every page of an anonymous workshop participant (`workshopParticipant`,
 * resolved by the server), who is kept in their workshop.
 *
 * Without a session (`signedIn` false), `/` is the landing page, which the
 * shell renders bare: no sidebar, no page frame.
 *
 * The page's scope reaches the shell only once the page has mounted, so the
 * server-rendered paint of a workshop page can't know it yet; there, CSS
 * keys off the scope provider's `data-workshop-scope` marker to start at the
 * rail's width with the sidebar blank, instead of flashing the global one.
 */
export function AppShell({
    signedIn,
    defaultCollapsed,
    defaultWidth,
    workshopParticipant,
    children,
}: {
    signedIn: boolean;
    defaultCollapsed: boolean;
    defaultWidth: number;
    workshopParticipant: WorkshopParticipant | null;
    children: ReactNode;
}) {
    const scope = useWorkspaceScope();
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(defaultCollapsed);
    const [width, setWidth] = useState(defaultWidth);
    const [workshopExpandedIn, setWorkshopExpandedIn] = useState<string | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerPath, setDrawerPath] = useState(pathname);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    // Navigating from inside the drawer closes it, as does widening past mobile.
    const isMobile = useIsMobile();
    if (drawerPath !== pathname) {
        setDrawerPath(pathname);
        setDrawerOpen(false);
    }
    if (drawerOpen && isMobile === false) setDrawerOpen(false);

    const workshopWorkspaceId = scope?.workshopId
        ? scope.workspaceId
        : (workshopParticipant?.workspaceId ?? null);
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
        setCollapsed(!collapsed);
        writeSidebarCollapsed(!collapsed);
    }, [workshopWorkspaceId, collapsed]);

    const settleWidth = useCallback((next: number) => {
        setWidth(next);
        writeSidebarWidth(next);
    }, []);

    const value = useMemo<ShellSidebarState>(
        () => ({
            collapsed: effectiveCollapsed,
            width,
            toggleCollapsed,
            openDrawer: () => setDrawerOpen(true),
            closeDrawer: () => setDrawerOpen(false),
            workshopParticipant,
        }),
        [effectiveCollapsed, width, toggleCollapsed, workshopParticipant],
    );

    if (!signedIn && pathname === "/") {
        return (
            <ShellSidebarContext.Provider value={value}>{children}</ShellSidebarContext.Provider>
        );
    }

    return (
        <ShellSidebarContext.Provider value={value}>
            <a
                href="#main"
                className={cn(
                    buttonVariants({ variant: "secondary", size: "sm" }),
                    "sr-only border focus:not-sr-only focus:fixed focus:left-3 focus:top-2 focus:z-50 focus:h-8 focus:px-3",
                )}
            >
                Skip to page
            </a>
            <div className="group/shell flex h-screen bg-gradient-to-tr from-background dark:to-primary/15 to-primary/30">
                <aside
                    id="app-sidebar"
                    aria-label="Sidebar"
                    style={{ "--sidebar-width": `${width}px` } as CSSProperties}
                    className={cn(
                        "relative hidden shrink-0 md:flex md:flex-col",
                        effectiveCollapsed ? "w-12" : "w-[var(--sidebar-width)]",
                        !mounted && "group-has-[[data-workshop-scope]]/shell:w-12",
                    )}
                >
                    <div
                        className={cn(
                            "flex h-full min-h-0 flex-col",
                            !mounted && "group-has-[[data-workshop-scope]]/shell:invisible",
                        )}
                    >
                        <AppSidebar variant={effectiveCollapsed ? "rail" : "expanded"} />
                    </div>
                    {!effectiveCollapsed && (
                        <SidebarResizeHandle
                            width={width}
                            controls="app-sidebar"
                            onResize={setWidth}
                            onResizeEnd={settleWidth}
                        />
                    )}
                </aside>
                <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
                    <SheetContent>
                        <SheetTitle className="sr-only">Sidebar</SheetTitle>
                        <SheetDescription className="sr-only">
                            Your charts, reports and workspaces
                        </SheetDescription>
                        <AppSidebar variant="drawer" />
                    </SheetContent>
                </Sheet>
                <main id="main" className="flex min-w-0 flex-1 flex-col overflow-hidden">
                    {children}
                </main>
            </div>
        </ShellSidebarContext.Provider>
    );
}
