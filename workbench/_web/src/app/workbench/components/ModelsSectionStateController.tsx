"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useModelsSection } from "@/stores/useModelsSection";

interface ModelsSectionStateControllerProps {
    /** True when the page is rendering AutoWorkspaceCreator instead of the
     * workspace list — the section is collapsed in that state so the create
     * flow takes focus. */
    isCreating: boolean;
}

/**
 * Pure side-effect component that nudges the shared `useModelsSection`
 * zustand store based on the current page context:
 *
 *   - `?models=open` URL hint (set by the landing-page "X more models"
 *     link) → expand the section, then strip the param so refreshes don't
 *     keep re-forcing it. This hint takes priority over the `isCreating`
 *     collapse — a user who clicked "more models" wants to see them even if
 *     a workspace is being created behind the scenes.
 *   - `isCreating` page state → collapse the section so the workspace
 *     creation flow is the focal point.
 *
 * Renders nothing. The store updates propagate to ModelsSection +
 * WorkspaceList (the latter adapts its pagination based on collapsed state).
 */
export function ModelsSectionStateController({ isCreating }: ModelsSectionStateControllerProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const setCollapsed = useModelsSection((s) => s.setCollapsed);

    const wantsOpen = searchParams.get("models") === "open";

    // Honor the ?models=open hint from the landing page on first paint, then
    // strip the param so a later manual collapse + refresh stays collapsed.
    useEffect(() => {
        if (!wantsOpen) return;
        setCollapsed(false);
        const params = new URLSearchParams(searchParams.toString());
        params.delete("models");
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [wantsOpen, searchParams, setCollapsed, router, pathname]);

    // Collapse while a workspace is being created so the section doesn't
    // dominate the loading view — UNLESS the user explicitly asked to see
    // the models (?models=open), which wins.
    useEffect(() => {
        if (isCreating && !wantsOpen) setCollapsed(true);
    }, [isCreating, wantsOpen, setCollapsed]);

    return null;
}
