import Image from "next/image";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface ChartPlaceholderProps {
    art: "lens" | "patching";
    title: string;
    children: ReactNode;
}

/**
 * A chart's page before its first run: the tool's illustration, faded into the
 * page at its edges, over a line on what the tool shows and how to start.
 */
export function ChartPlaceholder({ art, title, children }: ChartPlaceholderProps) {
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
                    "[mask-image:radial-gradient(closest-side,black_70%,transparent)]",
                    "dark:opacity-90 dark:[filter:invert(1)_hue-rotate(180deg)]",
                )}
            />
            <div className="-mt-2 max-w-md text-center sm:-mt-6">
                <p className="text-base font-medium text-foreground">{title}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">{children}</p>
            </div>
        </div>
    );
}

ChartPlaceholder.ART = {
    lens: "/images/placeholders/lens.webp",
    patching: "/images/placeholders/patching.webp",
} as const;
