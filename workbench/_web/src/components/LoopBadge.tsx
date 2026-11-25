"use client";

import { useId } from "react";

/**
 * A sticker for something looped: a dark seal ringed by one silver line that
 * curls into a loop every few degrees on its way round, with a short word in
 * white at its center. Home's line about the looped model wears it as its
 * "New" marker. Sized by Tailwind `h-*`/`w-*` on `className`; the 150×96
 * viewBox scales uniformly. `fontSize` is in viewBox units.
 */
export function LoopBadge({
    text,
    label,
    fontSize = 30,
    className,
}: {
    text: string;
    /** Accessible label / tooltip. Defaults to `text`. */
    label?: string;
    fontSize?: number;
    className?: string;
}) {
    const silver = useId();

    return (
        <svg viewBox="0 0 150 96" role="img" aria-label={label ?? text} className={className}>
            <title>{label ?? text}</title>
            <defs>
                <linearGradient id={silver} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#fafafa" />
                    <stop offset="0.5" stopColor="#a1a1aa" />
                    <stop offset="1" stopColor="#e4e4e7" />
                </linearGradient>
            </defs>
            <ellipse cx={LoopBadge.CX} cy={LoopBadge.CY} rx={54} ry={30} fill={LoopBadge.INK} />
            {/* The coil twice: a dark edge under the silver line, so it holds
                against a light page as well as a dark one. */}
            <path
                d={LoopBadge.COIL}
                fill="none"
                stroke={LoopBadge.INK}
                strokeWidth={7}
                strokeLinejoin="round"
            />
            <path
                d={LoopBadge.COIL}
                fill="none"
                stroke={`url(#${silver})`}
                strokeWidth={3.2}
                strokeLinejoin="round"
            />
            <text
                x={LoopBadge.CX}
                y={LoopBadge.CY + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fontWeight={800}
                fontSize={fontSize}
                letterSpacing={1.5}
                fill="#fff"
            >
                {text}
            </text>
        </svg>
    );
}

LoopBadge.CX = 75;
LoopBadge.CY = 48;
LoopBadge.INK = "#18181b";

/**
 * A closed line round an ellipse of radii (`rx`, `ry`) that turns `loops`
 * small circles of radius `curl` on the way: the point of a wheel rolling
 * round the ellipse, which crosses its own path once per turn.
 */
LoopBadge.coil = (rx: number, ry: number, curl: number, loops: number): string => {
    const steps = loops * 40;
    const points: string[] = [];
    for (let i = 0; i < steps; i++) {
        const t = (2 * Math.PI * i) / steps;
        const x = LoopBadge.CX + rx * Math.cos(t) + curl * Math.cos(loops * t);
        const y = LoopBadge.CY + ry * Math.sin(t) + curl * Math.sin(loops * t);
        points.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return `M${points.join("L")}Z`;
};

LoopBadge.COIL = LoopBadge.coil(60, 36, 9, 9);
