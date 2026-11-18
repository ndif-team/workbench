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
 * fade in, the text a beat after the illustration. A placeholder that takes
 * over from another carries its entrance on rather than starting it again:
 * the page of a chart being created shows one (`PendingChartPage`), and the
 * chart's own page replaces it mid-fade.
 */
export function ChartPlaceholder({ art, title, text }: ChartPlaceholderProps) {
    // How far into its entrance the previous placeholder was (ms), to carry on from there.
    const [elapsed] = useState(() =>
        ChartPlaceholder.mounted > 0 || Date.now() - ChartPlaceholder.seenAt < 1000
            ? Date.now() - ChartPlaceholder.startedAt
            : 0,
    );
    useEffect(() => {
        if (elapsed === 0) ChartPlaceholder.startedAt = Date.now();
        ChartPlaceholder.mounted += 1;
        return () => {
            ChartPlaceholder.mounted -= 1;
            ChartPlaceholder.seenAt = Date.now();
        };
    }, [elapsed]);

    return (
        <div className="flex size-full flex-col items-center justify-center overflow-hidden px-6 pb-6">
            <Image
                src={ChartPlaceholder.ART[art]}
                width={1280}
                height={640}
                sizes="(max-width: 768px) 100vw, 640px"
                priority
                alt=""
                style={{ animationDelay: `${-elapsed}ms` }}
                className={cn(
                    "h-auto min-h-0 w-full max-w-2xl shrink object-contain",
                    "duration-1000 ease-out animate-in fade-in zoom-in-95 motion-reduce:animate-none",
                    "[mask-image:radial-gradient(closest-side,black_70%,transparent)]",
                    "opacity-60 dark:[filter:invert(1)_hue-rotate(180deg)]",
                )}
            />
            <div
                style={{ animationDelay: `${300 - elapsed}ms` }}
                className="-mt-2 max-w-md text-center duration-700 ease-out animate-in fade-in slide-in-from-bottom-2 fill-mode-both motion-reduce:animate-none sm:-mt-6"
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

/** How many placeholders are on screen, when one last left it, and when the
 * entrance now playing began (ms). */
ChartPlaceholder.mounted = 0;
ChartPlaceholder.seenAt = 0;
ChartPlaceholder.startedAt = 0;

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
