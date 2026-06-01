"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
 *     keep re-forcing it.
 *   - `isCreating` page state → collapse the section so the workspace
 *     creation flow is the focal point.
 *
 * Renders nothing. The store updates propagate to ModelsSection +
 * WorkspaceList (the latter adapts its pagination based on collapsed state).
 */
export function ModelsSectionStateController({
    isCreating,
}: ModelsSectionStateControllerProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const setCollapsed = useModelsSection((s) => s.setCollapsed);

    // Honor the ?models=open hint from the landing page on first paint.
    // Strip the param afterwards so a manual collapse + refresh stays
    // collapsed.
    useEffect(() => {
        if (searchParams.get("models") !== "open") return;
        setCollapsed(false);
        const params = new URLSearchParams(searchParams.toString());
        params.delete("models");
        const qs = params.toString();
        router.replace(qs ? `?${qs}` : "?", { scroll: false });
    }, [searchParams, setCollapsed, router]);

    // Collapse while a workspace is being created so the section doesn't
    // dominate the loading view.
    useEffect(() => {
        if (isCreating) setCollapsed(true);
    }, [isCreating, setCollapsed]);

    return null;
}
