"use client";

import { type KeyboardEvent } from "react";
import { Info, Loader2 } from "lucide-react";

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
    /** True while a deployment warmup is in flight for this model — the card
     * shows a spinner + "deploying" instead of the heat dot / Deploy action. */
    deploying?: boolean;
}

interface ModelCardProps {
    m: ModelCardModel;
    /** Invoked when a deployed (hot/warm) or cold card is clicked. The caller
     * decides what that means by heat — open a chart, or deploy first.
     * Deploying cards ignore this. */
    onClick?: () => void;
    /** External link (the model's Hugging Face page) — opened from the small
     * info icon in the footer, not by clicking the card body. */
    href?: string;
}

/**
 * A model card. The footer band carries the deployment-status color and the
 * metadata (params · layers) plus a small info icon that links out to the
 * model's Hugging Face page. Clicking the card body:
 *  - runnable (hot/warm): opens the create-chart flow.
 *  - cold: kicks off deployment (the caller routes this).
 *  - deploying: inert (a passive status view).
 */
export function ModelCard({ m, onClick, href }: ModelCardProps) {
    const h = GROUP_HUE[m.group];
    const muted = m.heat === "gated" || m.heat === "unavailable";
    const heat = MODEL_STATUS[m.heat];
    const isDark = useIsDark();
    // Either our own in-flight warmup (`m.deploying`) or NDIF reporting the
    // model mid-load (`heat === "deploying"`) shows the deploying treatment.
    const deploying = !!m.deploying || m.heat === "deploying";
    const cold = m.heat === "cold";
    const runnable = m.heat === "hot" || m.heat === "warm";
    // Cold cards are clickable (→ deploy) and runnable cards are clickable
    // (→ open a chart). Deploying / gated / unavailable / unknown are inert.
    const clickable = !deploying && !!onClick && (cold || runnable);

    // Group pill keeps the model-family hue; the card accent (mesh blob +
    // border) follows the deployment-status color so heat reads at a glance.
    const pillBg = isDark ? `hsl(${h} 50% 18% / 0.7)` : `hsl(${h} 80% 96%)`;
    const pillBorder = isDark ? `hsl(${h} 50% 38% / 0.6)` : `hsl(${h} 60% 85%)`;
    const pillText = isDark ? `hsl(${h} 70% 78%)` : `hsl(${h} 70% 42%)`;

    // Deployment-status color is confined to the footer band (metadata +
    // Deploy); everything above stays the plain card surface. Hot reads better
    // as a cooler, fresher emerald than the standard heat-dot green.
    const accent = m.heat === "hot" ? "hsl(152 60% 40%)" : heat.color;
    const mix = (pct: number) => `color-mix(in srgb, ${accent} ${pct}%, hsl(var(--card)))`;
    // Vertical gradient — stronger at the bottom edge, fading up into the card.
    const footerBg = isDark
        ? `linear-gradient(to top, ${mix(30)}, ${mix(12)})`
        : `linear-gradient(to top, ${mix(22)}, ${mix(8)})`;
    const footerBorder = isDark
        ? `color-mix(in srgb, ${accent} 45%, hsl(var(--border)))`
        : `color-mix(in srgb, ${accent} 35%, hsl(var(--border)))`;

    const content = (
        <div className="flex flex-col gap-1.5 h-full">
            <div className="flex items-center justify-between gap-2">
                {deploying ? (
                    <span
                        className="inline-flex items-center gap-1.5 text-xs font-medium"
                        style={{ color: MODEL_STATUS.deploying.color }}
                    >
                        <Loader2 className="w-3 h-3 animate-spin" />
                        deploying
                    </span>
                ) : (
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
                )}
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

            <div
                className="flex items-center gap-3 -mx-3 -mb-2.5 mt-auto px-3 pb-1.5 pt-1 border-t font-mono text-xs text-muted-foreground"
                style={{ background: footerBg, borderColor: footerBorder }}
            >
                <span>{m.params}</span>
                <span className="opacity-45">·</span>
                <span>{m.layers}L</span>
                {href && (
                    <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`View ${m.org}/${m.name} on Hugging Face`}
                        className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:text-foreground hover:bg-foreground/10"
                    >
                        <Info className="h-3.5 w-3.5" />
                    </a>
                )}
            </div>
        </div>
    );

    const shell = cn(
        "group relative w-full min-w-0 px-3 py-2.5 rounded-md overflow-hidden border border-foreground/30 text-left transition-colors",
        clickable ? "cursor-pointer hover:border-foreground/45" : "cursor-default",
        muted && "opacity-70",
    );

    const style = {
        background: "hsl(var(--card))",
    } as const;

    // The card is a plain div so it can nest interactive children (the info
    // link, the Deploy button). Runnable cards get button semantics + keyboard
    // activation; cold/deploying cards are inert (their actions live inside).
    const fullName = `${m.org}/${m.name}`;
    const ariaLabel = deploying
        ? `${fullName} — deploying`
        : cold
          ? `Deploy ${fullName}`
          : runnable
            ? `Open ${fullName} in a chart`
            : `${fullName} — ${heat.label}`;

    const interactive = clickable
        ? {
              role: "button" as const,
              tabIndex: 0,
              onClick,
              onKeyDown: (e: KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onClick?.();
                  }
              },
          }
        : {};

    return (
        <div className={shell} style={style} aria-label={ariaLabel} {...interactive}>
            {content}
        </div>
    );
}
