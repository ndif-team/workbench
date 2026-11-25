"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * A line that curls into two loops, the mark of a looped transformer beside
 * Home's line about one. It is a dark wire (a silver one on the dark theme)
 * with a silver-and-white glint that keeps travelling it, the way such a
 * model goes round its middle layers again; still for a visitor who asked
 * for reduced motion. Sized by Tailwind `h-*`/`w-*` on `className` (a 44×22
 * viewBox).
 */
export function LoopMark({ className }: { className?: string }) {
    const still = useReducedMotion();

    /** A stretch of the line, `length` of it long, travelling `lead` ahead of the glint's tail. */
    const glint = (length: number, lead: number, stroke: string, width: number) => (
        <motion.path
            d={LoopMark.PATH}
            className={stroke}
            strokeWidth={width}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={`${length} ${1 - length}`}
            initial={{ strokeDashoffset: -lead }}
            animate={{ strokeDashoffset: [-lead, -lead - 1] }}
            transition={{ duration: LoopMark.LAP, ease: "linear", repeat: Infinity }}
        />
    );

    return (
        <svg viewBox="0 0 44 22" fill="none" className={className} aria-hidden="true">
            <path
                d={LoopMark.PATH}
                className="stroke-zinc-900 dark:stroke-zinc-500"
                strokeWidth={3}
                strokeLinecap="round"
            />
            {!still && glint(0.3, 0, "stroke-zinc-400 dark:stroke-zinc-300", 2)}
            {!still && glint(0.1, 0.1, "stroke-white", 2)}
        </svg>
    );
}

/** One stroke: in along the baseline, round a loop, on to a second, and out. */
LoopMark.PATH =
    "M2 19C10 19 18 16 18 9C18 4.5 14.5 3 12 3C9.5 3 6 4.5 6 9C6 16 14 19 22 19" +
    "C30 19 38 16 38 9C38 4.5 34.5 3 32 3C29.5 3 26 4.5 26 9C26 16 34 19 42 19";

/** Seconds the glint takes to travel the line once. */
LoopMark.LAP = 2.8;
