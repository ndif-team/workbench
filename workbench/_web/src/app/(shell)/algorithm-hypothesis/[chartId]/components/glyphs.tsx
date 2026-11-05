import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { VarType } from "@/types/algorithmHypothesis";

/**
 * Glyphs by type, after Figure 1 of Gur-Arieh et al.: a diamond for a
 * position ID, a circle for a string or int, and key : value for a pair
 * (a position : string pair reads ◇ : ●). Glyphs take the color of the text
 * around them: black by default, or the variable's own color.
 */

type TypeKind = "position" | "string" | "int" | "pair" | "unknown";

const typeKind = (t: VarType | null | undefined): TypeKind => (t ? t.kind : "unknown");

// ------------------------------------------------------------------ colors

/** Colors a user can give a variable; any "#rrggbb" works too. Cyan, pink and
 * purple are left out: they mean source, target and counterfactual. */
export const VARIABLE_COLORS = ["indigo", "emerald", "amber", "red", "lime", "slate"] as const;
type PaletteColor = (typeof VARIABLE_COLORS)[number];

const PALETTE: Record<
    PaletteColor,
    { text: string; border: string; stroke: string; fill: string; swatch: string }
> = {
    indigo: {
        text: "text-indigo-600 dark:text-indigo-400",
        border: "border-indigo-300 dark:border-indigo-700",
        stroke: "stroke-indigo-500 dark:stroke-indigo-400",
        fill: "fill-indigo-500 dark:fill-indigo-400",
        swatch: "bg-indigo-500",
    },
    emerald: {
        text: "text-emerald-700 dark:text-emerald-400",
        border: "border-emerald-300 dark:border-emerald-700",
        stroke: "stroke-emerald-600 dark:stroke-emerald-400",
        fill: "fill-emerald-600 dark:fill-emerald-400",
        swatch: "bg-emerald-600",
    },
    amber: {
        text: "text-amber-700 dark:text-amber-400",
        border: "border-amber-300 dark:border-amber-700",
        stroke: "stroke-amber-600 dark:stroke-amber-400",
        fill: "fill-amber-600 dark:fill-amber-400",
        swatch: "bg-amber-500",
    },
    red: {
        text: "text-red-600 dark:text-red-400",
        border: "border-red-300 dark:border-red-700",
        stroke: "stroke-red-500 dark:stroke-red-400",
        fill: "fill-red-500 dark:fill-red-400",
        swatch: "bg-red-500",
    },
    lime: {
        text: "text-lime-700 dark:text-lime-400",
        border: "border-lime-400 dark:border-lime-700",
        stroke: "stroke-lime-600 dark:stroke-lime-400",
        fill: "fill-lime-600 dark:fill-lime-400",
        swatch: "bg-lime-600",
    },
    slate: {
        text: "text-slate-500 dark:text-slate-400",
        border: "border-slate-300 dark:border-slate-600",
        stroke: "stroke-slate-400",
        fill: "fill-slate-400",
        swatch: "bg-slate-400",
    },
};

const isHex = (c: string | null | undefined): c is string => !!c && /^#[0-9a-fA-F]{6}$/.test(c);
const paletteOf = (c: string | null | undefined) =>
    c && c in PALETTE ? PALETTE[c as PaletteColor] : null;

/** Classes and style for a chip's text and border in a variable's color. */
export function chipColor(color: string | null | undefined): {
    className: string;
    style?: CSSProperties;
} {
    const p = paletteOf(color);
    if (p) return { className: cn(p.text, p.border) };
    if (isHex(color)) return { className: "", style: { color, borderColor: `${color}80` } };
    return { className: "text-foreground border-foreground/25" };
}

/** Classes and style for an arrow (curve and head) in a variable's color. */
export function arrowColor(color: string | null | undefined): {
    stroke: string;
    fill: string;
    strokeStyle?: CSSProperties;
    fillStyle?: CSSProperties;
} {
    const p = paletteOf(color);
    if (p) return { stroke: p.stroke, fill: p.fill };
    if (isHex(color))
        return { stroke: "", fill: "", strokeStyle: { stroke: color }, fillStyle: { fill: color } };
    return { stroke: "stroke-foreground", fill: "fill-foreground" };
}

/** A filled dot in a variable's color, for color pickers and lists. */
export function ColorSwatch({ color, className }: { color: string; className?: string }) {
    const p = paletteOf(color);
    return (
        <span
            aria-hidden="true"
            className={cn("inline-block size-3 shrink-0 rounded-full", p?.swatch, className)}
            style={p ? undefined : { backgroundColor: color }}
        />
    );
}

// ------------------------------------------------------------------ glyphs

function Mark({ kind, className }: { kind: Exclude<TypeKind, "pair">; className?: string }) {
    const common = {
        viewBox: "0 0 12 12",
        className: cn("shrink-0", className),
        "aria-hidden": true,
    } as const;
    if (kind === "position")
        return (
            <svg {...common}>
                <path d="M6 1 11 6 6 11 1 6Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
        );
    if (kind === "unknown")
        return (
            <svg {...common}>
                <rect
                    x="2"
                    y="2"
                    width="8"
                    height="8"
                    rx="1.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeDasharray="2 1.5"
                />
            </svg>
        );
    return (
        <svg {...common}>
            <circle cx="6" cy="6" r="4" fill="currentColor" />
        </svg>
    );
}

/** The glyph for a type; pairs render as key : value, recursively. */
export function TypeGlyph({
    type,
    className,
}: {
    type: VarType | null | undefined;
    className?: string;
}) {
    if (!type || type.kind !== "pair")
        return <Mark kind={typeKind(type) as Exclude<TypeKind, "pair">} className={className} />;
    const side = (t: VarType) =>
        t.kind === "pair" ? (
            <span className="inline-flex items-center opacity-70">
                (<TypeGlyph type={t} className={className} />)
            </span>
        ) : (
            <TypeGlyph type={t} className={className} />
        );
    return (
        <span className="inline-flex shrink-0 items-center" aria-hidden="true">
            {side(type.key)}
            <span className="px-px leading-none opacity-70">:</span>
            {side(type.value)}
        </span>
    );
}
