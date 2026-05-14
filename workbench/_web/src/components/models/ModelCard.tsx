"use client";

import { cn } from "@/lib/utils";
import { useIsDark } from "@/hooks/useIsDark";
import {
    MODEL_STATUS,
    GROUP_HUE,
    type ModelHeat,
    type ModelGroup,
} from "@/components/model-selector/status";

export interface ModelCardModel {
    org: string;
    name: string;
    group: ModelGroup;
    heat: ModelHeat;
    params: string;
    layers: number;
}

interface ModelCardProps {
    m: ModelCardModel;
    onClick?: () => void;
    href?: string;
}

/**
 * Group-mesh treatment: a soft radial blob in the group's hue from the
 * top-right, fading into the panel surface. Heat pill on the left, group pill
 * on the right, org / name underneath, stats row at the bottom.
 *
 * Renders as a button by default; pass `href` for an external link (HF page).
 */
export function ModelCard({ m, onClick, href }: ModelCardProps) {
    const h = GROUP_HUE[m.group];
    const muted = m.heat === "gated" || m.heat === "unavailable";
    const heat = MODEL_STATUS[m.heat];
    const isDark = useIsDark();

    // Group-pill + card-border tones, per theme.
    const pillBg = isDark ? `hsl(${h} 50% 18% / 0.7)` : `hsl(${h} 80% 96%)`;
    const pillBorder = isDark ? `hsl(${h} 50% 38% / 0.6)` : `hsl(${h} 60% 85%)`;
    const pillText = isDark ? `hsl(${h} 70% 78%)` : `hsl(${h} 70% 42%)`;
    const cardBorder = isDark
        ? `hsl(${h} 40% 40% / 0.45)`
        : `hsl(${h} 50% 85% / 0.7)`;
    const blobAlpha = isDark ? 0.22 : 0.32;

    const content = (
        <div className="flex flex-col gap-1.5 h-full">
            <div className="flex items-center justify-between gap-2">
                <span
                    className="inline-flex items-center gap-1.5 text-xs font-medium"
                    style={{ color: heat.color }}
                >
                    <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                            background: heat.color,
                            boxShadow: `0 0 0 3px ${heat.color}26`,
                        }}
                    />
                    {heat.label}
                </span>
                <span
                    className="text-xs font-medium px-1.5 py-0.5 rounded border"
                    style={{
                        color: pillText,
                        background: pillBg,
                        borderColor: pillBorder,
                    }}
                >
                    {m.group}
                </span>
            </div>

            <div className="flex flex-col">
                <span className="text-xs text-muted-foreground truncate leading-tight">
                    {m.org}
                </span>
                <span className="font-mono text-sm font-semibold truncate leading-tight">
                    {m.name}
                </span>
            </div>

            <div className="flex items-center gap-3 pt-1.5 mt-1 border-t border-border/60 font-mono text-xs text-muted-foreground">
                <span>{m.params}</span>
                <span className="opacity-45">·</span>
                <span>{m.layers}L</span>
            </div>
        </div>
    );

    const shell = cn(
        "group relative w-full min-w-0 px-3 py-2.5 rounded-md overflow-hidden border text-left transition-shadow hover:shadow-sm",
        muted && "opacity-70",
    );

    const style = {
        background: `radial-gradient(circle at 100% 0%, hsl(${h} 85% 70% / ${blobAlpha}), transparent 55%), hsl(var(--card))`,
        borderColor: cardBorder,
    } as const;

    if (href) {
        return (
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClick}
                className={shell}
                style={style}
                aria-label={`${m.org}/${m.name} — ${heat.label}`}
            >
                {content}
            </a>
        );
    }

    return (
        <button
            type="button"
            onClick={onClick}
            className={shell}
            style={style}
            aria-label={`${m.org}/${m.name} — ${heat.label}`}
        >
            {content}
        </button>
    );
}
