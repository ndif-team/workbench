"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface ChartPlaceholderProps {
    art: "lens" | "patching";
    title: string;
    text: ReactNode;
}

/**
 * A chart's page before its first run: the tool's illustration, faded into the
 * page at its edges, over a line on what the tool shows and how to start. Both
 * fade in, the text a beat after the illustration, unless a placeholder was
 * on screen a moment ago: the page of a chart being created shows one
 * (`PendingChartPage`), and the chart's own page then takes over from it.
 */
export function ChartPlaceholder({ art, title, text }: ChartPlaceholderProps) {
    const [still] = useState(() => Date.now() - ChartPlaceholder.seenAt < 1000);
    useEffect(() => {
        ChartPlaceholder.seenAt = Date.now();
        return () => {
            ChartPlaceholder.seenAt = Date.now();
        };
    }, []);

    return (
        <div className="flex size-full flex-col items-center justify-center overflow-hidden px-6 pb-6">
            <Image
                src={ChartPlaceholder.ART[art]}
                width={1280}
                height={640}
                sizes="(max-width: 768px) 100vw, 640px"
                priority
                alt=""
                className={cn(
                    "h-auto min-h-0 w-full max-w-2xl shrink object-contain",
                    !still &&
                        "duration-1000 ease-out animate-in fade-in zoom-in-95 motion-reduce:animate-none",
                    "[mask-image:radial-gradient(closest-side,black_70%,transparent)]",
                    "opacity-60 dark:[filter:invert(1)_hue-rotate(180deg)]",
                )}
            />
            <div
                className={cn(
                    "-mt-2 max-w-md text-center sm:-mt-6",
                    !still &&
                        "delay-300 duration-700 ease-out animate-in fade-in slide-in-from-bottom-2 fill-mode-both motion-reduce:animate-none",
                )}
            >
                <p className="text-base font-medium text-foreground">{title}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
            </div>
        </div>
    );
}

ChartPlaceholder.ART = {
    lens: "/images/placeholders/lens.webp",
    patching: "/images/placeholders/patching.webp",
} as const;

/** When a placeholder was last on screen (ms), so the next one doesn't fade in again. */
ChartPlaceholder.seenAt = 0;

/** Each tool's placeholder before its first run. */
ChartPlaceholder.EMPTY = {
    "logit-lens": {
        art: "lens",
        title: "See how a prediction takes shape",
        text: "Enter a prompt and explore the model prediction at every layer.",
    },
    jlens: {
        art: "lens",
        title: "See how a prediction takes shape",
        text: "Enter a prompt and explore the model prediction at every layer.",
    },
    "activation-patching": {
        art: "patching",
        title: "Localize where concepts are computed",
        text: "Patch from one prompt to another to determine which components have downstream effects on the model prediction.",
    },
} as const;
