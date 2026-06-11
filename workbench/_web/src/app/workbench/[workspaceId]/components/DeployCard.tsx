"use client";

import { cn } from "@/lib/utils";
import { sidebarCardBase, sidebarCardSelected } from "./sidebarCardShell";

const stripOrg = (name: string) => {
    const slash = name.lastIndexOf("/");
    return slash === -1 ? name : name.slice(slash + 1);
};

interface DeployCardProps {
    model: string;
    /** True when this is the active chart (deploying panel open). */
    selected?: boolean;
    /** Navigate to the chart this deploy belongs to. */
    onClick?: () => void;
}

/**
 * The sidebar row for a chart whose model is warming up. It stands in for the
 * chart's normal card until the model is ready, then the sidebar swaps back to
 * <ChartCard>. Deliberately quiet — the model name is the hero and the brand
 * conic ring is the single point of color; no date, no menu. It's still the
 * chart's row, so it's clickable (opens the deploying panel) and reflects
 * selection.
 */
export function DeployCard({ model, selected = false, onClick }: DeployCardProps) {
    return (
        <div
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            onClick={onClick}
            onKeyDown={(e) => {
                if (onClick && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onClick();
                }
            }}
            className={cn(
                sidebarCardBase,
                "cursor-pointer",
                selected ? sidebarCardSelected : "border-primary/30 bg-primary/[0.04]",
            )}
        >
            <span className="truncate font-mono text-sm font-medium text-foreground">
                {stripOrg(model)}
            </span>
            <span
                aria-live="polite"
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
                <span
                    aria-hidden
                    style={{ width: 12, height: 12 }}
                    className="brand-spinner inline-block shrink-0 motion-safe:animate-spin [animation-duration:1.4s]"
                />
                Deploying
            </span>
        </div>
    );
}
