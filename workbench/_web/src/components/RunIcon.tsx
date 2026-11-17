/**
 * Run's glyph in the composers (Home's and the phone's): an arrow on a rounded
 * square in the button's color, the charts' violet, lifting under the pointer
 * and sinking on a press.
 */
export function RunIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="!size-6 transition-transform duration-200 group-hover/run:-translate-y-0.5 group-active/run:scale-90"
        >
            <rect x="1" y="1" width="22" height="22" rx="5" fill="currentColor" />
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
