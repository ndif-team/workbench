"use client";

import {
    createContext,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";

import type { WorkspaceScope } from "@/types/workspaces";

/**
 * The workspace a chart or report page renders in. The workspace is no longer
 * part of the URL, so each chart route's and the report route's server
 * `layout.tsx` looks it up from the item in the URL and provides it here
 * (`ChartWorkspaceScope` / `ReportWorkspaceScope`). Components read it with
 * `useScopedWorkspaceId` (inside an item route) or `useWorkspaceScope` (anywhere).
 *
 * The app shell sits above those layouts, so a `WorkspaceScopeHost` in the
 * shell layout receives a copy of the current scope; that is what
 * `useWorkspaceScope` returns to shell chrome (sidebar, header). The copy is
 * published in a layout effect, so it lands before the browser paints.
 *
 * Moving the item on screen changes its workspace: refresh the route
 * (`router.refresh()`) so the layout re-reads the scope.
 */

const ScopeContext = createContext<WorkspaceScope | null>(null);

type HostValue = {
    scope: WorkspaceScope | null;
    setScope: (scope: WorkspaceScope | null) => void;
};

const HostContext = createContext<HostValue | null>(null);

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Shell-level holder of the current item's scope, for chrome above the item routes. */
export function WorkspaceScopeHost({ children }: { children: ReactNode }) {
    const [scope, setScope] = useState<WorkspaceScope | null>(null);
    const value = useMemo(() => ({ scope, setScope }), [scope]);
    return <HostContext.Provider value={value}>{children}</HostContext.Provider>;
}

/** Provides an item route's workspace scope; rendered by the route's server layout. */
export function WorkspaceScopeProvider({
    scope,
    children,
}: {
    scope: WorkspaceScope;
    children: ReactNode;
}) {
    const setHostScope = useContext(HostContext)?.setScope;
    const { workspaceId, workshopId, isDefault } = scope;
    const value = useMemo(
        () => ({ workspaceId, workshopId, isDefault }),
        [workspaceId, workshopId, isDefault],
    );

    useIsomorphicLayoutEffect(() => {
        setHostScope?.(value);
        return () => setHostScope?.(null);
    }, [setHostScope, value]);

    return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

/**
 * The current item's workspace scope, or null outside chart and report pages
 * (e.g. `/models`). Inside an item route this is the route's own scope.
 */
export function useWorkspaceScope(): WorkspaceScope | null {
    const own = useContext(ScopeContext);
    const host = useContext(HostContext);
    return own ?? host?.scope ?? null;
}

/** The workspace id of the chart or report route this component renders in. */
export function useScopedWorkspaceId(): string {
    const scope = useContext(ScopeContext);
    if (!scope) {
        throw new Error("useScopedWorkspaceId must be used inside a chart or report route");
    }
    return scope.workspaceId;
}
