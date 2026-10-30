import type * as React from "react";

/**
 * The workbench mosaic (3×3 squares, one orange "finding"), optionally with the
 * wordmark. Self-contained: inline styles only, no imports, Tailwind classes or
 * required CSS, so the file can be copied anywhere. Inside the app it picks up
 * the shell's orange, ink and Archivo through their CSS variables; elsewhere it
 * falls back to the same values.
 */
const GAP = 2;
const FINDING = "var(--cw-hl, #F2892A)";

const CELLS: Array<{ fill?: string; outline?: string }> = [
    { outline: "#9582DB" },
    { outline: "#7890E6" },
    { fill: "#4BA6F6" },
    { outline: "#9582DB" },
    { fill: "#7890E6" },
    { fill: FINDING },
    { fill: "#9582DB" },
    { fill: "#7890E6" },
    { fill: "#4BA6F6" },
];

const WORDMARK: React.CSSProperties = {
    fontFamily: 'var(--cw-font-sans, "Archivo"), "Helvetica Neue", Arial, sans-serif',
    fontSize: 17,
    fontWeight: 600,
    letterSpacing: "-0.01em",
    fontStretch: "112%",
};

/** The mosaic alone: 3 × 3 squares of `cell` px with 2px gaps. */
export function CwLogoMark({ cell = 6, className }: { cell?: number; className?: string }) {
    return (
        <span
            aria-hidden
            className={className}
            style={{ display: "grid", gridTemplateColumns: `repeat(3, ${cell}px)`, gap: GAP }}
        >
            {CELLS.map((c, i) => (
                <span
                    key={i}
                    style={{
                        display: "block",
                        boxSizing: "border-box",
                        width: cell,
                        height: cell,
                        background: c.fill,
                        border: c.outline ? `1px solid ${c.outline}` : undefined,
                    }}
                />
            ))}
        </span>
    );
}

export function CwLogo({
    cell = 6,
    wordmark = false,
    className,
}: {
    /** Square size in px (sidebar 6, headings 10). */
    cell?: number;
    wordmark?: boolean;
    className?: string;
}) {
    return (
        <span
            className={className}
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                color: "var(--cw-ink, currentColor)",
            }}
        >
            <CwLogoMark cell={cell} />
            {wordmark && <span style={WORDMARK}>workbench</span>}
        </span>
    );
}
