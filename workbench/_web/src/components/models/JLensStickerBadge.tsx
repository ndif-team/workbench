import * as React from "react";

/**
 * Prototype "promo sticker" flagging a model that supports j-lens: an elongated
 * starburst seal (yellow fill, purple contour) reading "J Lens", meant to be
 * stuck on a corner of the model card. Deliberately loud — a spike to evaluate
 * the look. Elongated horizontally so the wordmark has room to breathe.
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

export function JLensStickerBadge({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 150 96" role="img" aria-label="Supports J-Lens" className={className}>
            <title>Supports J-Lens</title>
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
                fontSize={23}
                fill="#6D28D9"
            >
                J Lens
            </text>
        </svg>
    );
}
