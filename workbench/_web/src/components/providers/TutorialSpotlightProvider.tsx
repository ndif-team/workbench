"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { SpotlightTarget } from "@/types/tutorial-content";

/**
 * Shared spotlight state for the guided tutorial's "Show me" hints. The tutorial
 * panel (in PatchLensArea) sets a target cell; the Patch Lens display consumes it
 * to draw attention to that cell.
 *
 * NOTE: this context currently lives in the workbench and drives a coarse
 * highlight on the display container. The intended end state (per the design
 * decision) is to move this provider *into* the edulogitlens widget so the
 * widget can highlight the exact cell/token internally — that requires editing
 * the hash-pinned edulogitlens repo and bumping the pin. Until then the seam is
 * here so no wiring is wasted.
 */

interface SpotlightContextValue {
    target: SpotlightTarget | null;
    setTarget: (target: SpotlightTarget | null) => void;
}

const SpotlightContext = createContext<SpotlightContextValue>({
    target: null,
    setTarget: () => {},
});

export function TutorialSpotlightProvider({ children }: { children: ReactNode }) {
    const [target, setTarget] = useState<SpotlightTarget | null>(null);
    const value = useMemo(() => ({ target, setTarget }), [target]);
    return <SpotlightContext.Provider value={value}>{children}</SpotlightContext.Provider>;
}

export const useTutorialSpotlight = () => useContext(SpotlightContext);
