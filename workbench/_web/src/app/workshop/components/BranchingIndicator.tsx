"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface BranchingIndicatorProps {
    /** Number of pre-loaded branches in the current branching demo (defaults to 3). */
    branchCount?: number;
    /** Where clicking the indicator should take the participant. */
    href?: string;
}

/**
 * Persistent upper-right framing scaffold (spec §0.1, §1.3). Reminds the
 * participant that the current view is one node in a branching probability
 * tree. Dismissible per spec §5 item 3.
 */
export function BranchingIndicator({
    branchCount = 3,
    href = "/workshop/branching_demo_fixture",
}: BranchingIndicatorProps) {
    const [dismissed, setDismissed] = useState(false);
    if (dismissed) return null;

    return (
        <aside
            data-testid="branching-indicator"
            className={cn(
                "fixed top-3 right-3 z-50 flex items-start gap-2",
                "rounded-md border bg-background/90 backdrop-blur shadow-sm p-2 max-w-[280px]",
            )}
        >
            <Link href={href} className="flex flex-col gap-1 group">
                <svg
                    width="40"
                    height="36"
                    viewBox="0 0 40 36"
                    fill="none"
                    aria-hidden="true"
                    className="opacity-80 group-hover:opacity-100"
                >
                    <line x1="20" y1="6" x2="6" y2="22" stroke="currentColor" strokeWidth="1.4" />
                    <line x1="20" y1="6" x2="20" y2="22" stroke="currentColor" strokeWidth="1.4" />
                    <line x1="20" y1="6" x2="34" y2="22" stroke="currentColor" strokeWidth="1.4" />
                    <circle cx="20" cy="6" r="3" fill="currentColor" />
                    <circle cx="6" cy="22" r="2.4" fill="currentColor" />
                    <circle cx="20" cy="22" r="2.4" fill="currentColor" />
                    <circle cx="34" cy="22" r="2.4" fill="currentColor" />
                </svg>
                <span className="text-[11px] leading-snug text-muted-foreground">
                    You are looking at one branch of a tree of {branchCount} possible outputs.
                </span>
            </Link>
            <button
                type="button"
                aria-label="Dismiss branching indicator"
                data-testid="branching-indicator-dismiss"
                onClick={() => setDismissed(true)}
                className="text-muted-foreground hover:text-foreground text-xs"
            >
                ×
            </button>
        </aside>
    );
}
