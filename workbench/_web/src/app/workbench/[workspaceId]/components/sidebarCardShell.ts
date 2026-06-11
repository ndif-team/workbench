import { cn } from "@/lib/utils";

/**
 * Shared shell for the sidebar list cards (chart, report, deploy) so they stay
 * visually coherent: one radius, one border weight, and a single selection
 * channel — the border upgrades to primary (crisp 2px via an inset ring, no
 * glow) when selected. Status/identity lives in the *fill*; selection lives in
 * the *border* — the two never collide.
 */
// Left padding is `pl-7` (not `p-3`) to reserve a gutter for the drag handle
// that `SortableEntry` overlays at the card's left edge (it spans ~4–24px), so
// the title never slides under it. Applied uniformly so every row's text shares
// one left edge, handle or not.
export const sidebarCardBase =
    "group relative flex w-full flex-col gap-1 rounded border py-3 pl-7 pr-3 text-left transition-colors duration-100";

/** The selected edge — a crisp 2px primary border (inset ring, no glow) plus a
 * faint primary fill. Shared so chart/report/deploy cards select identically. */
export const sidebarCardSelected = "border-primary bg-primary/[0.04] ring-1 ring-inset ring-primary";

export function sidebarCardShell({ selected }: { selected: boolean }) {
    return cn(
        sidebarCardBase,
        "cursor-pointer",
        selected
            ? sidebarCardSelected
            : // Match the app's surface tokens (the chart panels use the same)
              // so cards read as a soft, cohesive surface rather than stark white.
              "border-border bg-secondary/80 hover:border-foreground/20 hover:bg-secondary dark:bg-secondary/50 dark:hover:bg-secondary/70",
    );
}
