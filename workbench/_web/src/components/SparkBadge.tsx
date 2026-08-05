import * as React from "react";

/**
 * A loud starburst "seal" badge — yellow fill, purple contour, centered text.
 * The reusable spark/blast flag: the J-Lens model-card sticker and the landing
 * "New" marker both use it. Sized by Tailwind `h-*`/`w-*` on `className` (the
 * elongated 150×96 viewBox scales uniformly, so the spikes stay proportioned).
 * `fontSize` is in viewBox units — bump it for short words so they fill the
 * badge (e.g. "New") vs. a longer wordmark (e.g. "J Lens").
 */

const CX = 75;
const CY = 48;

// Build an elliptical starburst: `spikes` outer points alternating with inner
// ones, on ellipses of radii (rx, ry). Elongating rx > ry stretches it wide.
function burstPoints(
    spikes: number,
    outerRx: number,
    outerRy: number,
    innerRx: number,
    innerRy: number,
): string {
    const pts: string[] = [];
    const step = Math.PI / spikes;
    for (let i = 0; i < spikes * 2; i++) {
        const rx = i % 2 === 0 ? outerRx : innerRx;
        const ry = i % 2 === 0 ? outerRy : innerRy;
        const a = i * step - Math.PI / 2;
        pts.push(`${(CX + rx * Math.cos(a)).toFixed(2)},${(CY + ry * Math.sin(a)).toFixed(2)}`);
    }
    return pts.join(" ");
}

// Wide, spiky star: deep inner/outer ratio → long points; rx > ry → elongated.
const BURST = burstPoints(13, 72, 45, 52, 28);

export function SparkBadge({
    text,
    label,
    fontSize = 23,
    className,
}: {
    text: string;
    /** Accessible label / tooltip. Defaults to `text`. */
    label?: string;
    /** Text size in viewBox units (150×96). Larger for short words. */
    fontSize?: number;
    className?: string;
}) {
    return (
        <svg viewBox="0 0 150 96" role="img" aria-label={label ?? text} className={className}>
            <title>{label ?? text}</title>
            <polygon
                points={BURST}
                fill="#FDE047"
                stroke="#7C3AED"
                strokeWidth={4}
                strokeLinejoin="miter"
                strokeMiterlimit={10}
            />
            <text
                x={CX}
                y={CY + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily="var(--font-mono, ui-monospace, monospace)"
                fontWeight={700}
                fontSize={fontSize}
                fill="#6D28D9"
            >
                {text}
            </text>
        </svg>
    );
}
