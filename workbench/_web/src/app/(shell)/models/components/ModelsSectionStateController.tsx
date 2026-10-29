"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useModelsSection } from "@/stores/useModelsSection";

/**
 * Pure side-effect component that honors the `?models=open` URL hint (set by
 * links that want the models grid shown): it expands the shared
 * `useModelsSection` section, then strips the param so refreshes don't keep
 * re-forcing it. Renders nothing.
 */
export function ModelsSectionStateController() {
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

    return null;
}
