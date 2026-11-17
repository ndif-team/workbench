import { useId } from "react";

/**
 * Run's glyph in the composers (Home's and the phone's): an arrow on a rounded square that runs from violet into the
 * brand's purple, lifting under the pointer and sinking on a press.
 */
export function RunIcon() {
    const gradient = useId();
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="!size-6 transition-transform duration-200 group-hover/run:-translate-y-0.5 group-active/run:scale-90"
        >
            <defs>
                <linearGradient
                    id={gradient}
                    gradientUnits="userSpaceOnUse"
                    x1="3"
                    y1="3"
                    x2="21"
                    y2="21"
                >
                    <stop offset="0" stopColor="currentColor" />
                    <stop offset="1" className="[stop-color:theme(colors.purple.600)]" />
                </linearGradient>
            </defs>
            <rect x="1" y="1" width="22" height="22" rx="5" fill={`url(#${gradient})`} />
            <path
                d="M12 17V7.5M7.5 12 12 7.5l4.5 4.5"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
