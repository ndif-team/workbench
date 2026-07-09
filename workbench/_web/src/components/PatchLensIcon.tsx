import * as React from "react";

/**
 * Patch Lens tool icon: a logit-lens grid (the heatmap the tool renders) with an
 * activation-patch arrow injecting into one of its cells — a portmanteau of the
 * two techniques the tool combines. Drawn in Lucide's style (24×24, currentColor
 * stroke, round caps/joins) so it sits cleanly beside the other tool icons.
 * Sized by Tailwind `h-*`/`w-*` classes passed via `className`, like a Lucide icon.
 */
export function PatchLensIcon({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            {/* lens grid (the logit-lens heatmap) */}
            <rect x="9" y="3" width="12" height="12" rx="1.5" />
            <path d="M15 3v12" />
            <path d="M9 9h12" />
            {/* activation-patch arrow injecting up into a cell */}
            <path d="M3 21h9v-6" />
            <path d="M9.5 17.5 12 15 14.5 17.5" />
        </svg>
    );
}
