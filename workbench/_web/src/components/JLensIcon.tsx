import * as React from "react";

/**
 * J-Lens tool icon: the letter "J" beside a magnifying glass (the "lens", drawn
 * as Lucide's Search glyph — a circle + handle). Rendered in Lucide's style
 * (24×24, currentColor stroke, round caps/joins) so it sits cleanly beside the
 * other tool icons and sizes via Tailwind `h-*`/`w-*` classes.
 */
export function JLensIcon({ className }: { className?: string }) {
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
            {/* "J" */}
            <path d="M3 4h4.5" />
            <path d="M6 4v8a2.5 2.5 0 0 1-2.5 2.5" />
            {/* lens (magnifying glass) */}
            <circle cx="15" cy="10" r="5" />
            <path d="m18.5 13.5 2.5 2.5" />
        </svg>
    );
}
