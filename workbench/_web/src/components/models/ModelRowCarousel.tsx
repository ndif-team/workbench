"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ModelCard, type ModelCardModel } from "./ModelCard";

interface ModelRowCarouselProps {
    label: string;
    models: ModelCardModel[];
    onCardClick?: (m: ModelCardModel) => void;
    cardHref?: (m: ModelCardModel) => string | undefined;
}

/**
 * Two-row horizontal scroller, column-major flow (card pairs stack vertically
 * then progress horizontally). The viewport is sized so exactly 4 columns are
 * visible at `lg+` breakpoints (3 at md, 2 at sm, 1 below); anything past that
 * is reachable by scrolling. Nav buttons + progress + edge fades appear only
 * when there's something to scroll to.
 */
export function ModelRowCarousel({ label, models, onCardClick, cardHref }: ModelRowCarouselProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [progress, setProgress] = useState(0);
    const [hasOverflow, setHasOverflow] = useState(false);
    const [pageWidth, setPageWidth] = useState(0);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const update = () => {
            const max = el.scrollWidth - el.clientWidth;
            setHasOverflow(max > 1);
            setProgress(max > 0 ? el.scrollLeft / max : 0);
            setPageWidth(el.clientWidth);
        };
        update();
        el.addEventListener("scroll", update, { passive: true });
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => {
            el.removeEventListener("scroll", update);
            ro.disconnect();
        };
    }, [models]);

    // Page by the visible width — one click moves by ~one full screen of cards.
    const scrollByPage = (dir: -1 | 1) =>
        ref.current?.scrollBy({ left: dir * pageWidth, behavior: "smooth" });

    return (
        <div className="relative">
            <div className="flex items-baseline justify-between gap-3 px-1 pt-3.5 pb-2">
                <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-foreground">{label}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {models.length}
                    </span>
                </div>

                {hasOverflow && (
                    <div className="flex items-center gap-2">
                        <ScrollProgress progress={progress} />
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => scrollByPage(-1)}
                            disabled={progress <= 0.001}
                            aria-label={`Scroll ${label} left`}
                        >
                            <ChevronLeft className="w-3 h-3" />
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => scrollByPage(1)}
                            disabled={progress >= 0.999}
                            aria-label={`Scroll ${label} right`}
                        >
                            <ChevronRight className="w-3 h-3" />
                        </Button>
                    </div>
                )}
            </div>

            <div className="relative">
                <div
                    ref={ref}
                    className={cn(
                        "grid gap-3 overflow-x-auto py-0.5",
                        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                        // Card column width: container split into 1 / 2 / 3 / 4
                        // visible columns by breakpoint. The math accounts for
                        // (N-1) gaps inside the visible viewport.
                        "[--cols:1] sm:[--cols:2] md:[--cols:3] lg:[--cols:4]",
                    )}
                    style={{
                        gridAutoFlow: "column",
                        // Only stack into a second row when the group has more
                        // than 4 models — otherwise the row stays a single line.
                        gridTemplateRows: models.length > 4 ? "repeat(2, auto)" : "auto",
                        // Cap each card at 268px so cards don't stretch
                        // hollow on wide viewports, while still shrinking
                        // below the cap at small viewports.
                        gridAutoColumns:
                            "min(268px, calc((100% - (var(--cols) - 1) * 12px) / var(--cols)))",
                    }}
                >
                    {models.length === 0 ? (
                        <div
                            className="px-3.5 py-6 rounded-md border border-dashed bg-muted/30 text-center text-xs text-muted-foreground"
                            style={{ gridColumn: "1 / -1", gridRow: "1 / -1" }}
                        >
                            no models match the current filters
                        </div>
                    ) : (
                        models.map((m) => (
                            <ModelCard
                                key={`${m.org}/${m.name}`}
                                m={m}
                                onClick={onCardClick ? () => onCardClick(m) : undefined}
                                href={cardHref?.(m)}
                            />
                        ))
                    )}
                </div>

                {progress > 0.01 && (
                    <div
                        className={cn(
                            "pointer-events-none absolute inset-y-0 left-0 w-6",
                            "bg-gradient-to-r from-background to-transparent",
                        )}
                    />
                )}
                {hasOverflow && progress < 0.99 && (
                    <div
                        className={cn(
                            "pointer-events-none absolute inset-y-0 right-0 w-6",
                            "bg-gradient-to-l from-background to-transparent",
                        )}
                    />
                )}
            </div>
        </div>
    );
}

function ScrollProgress({ progress }: { progress: number }) {
    const filled = Math.min(100, 24 + progress * 76);
    return (
        <div className="relative w-[140px] h-1 rounded-full bg-muted overflow-hidden">
            <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-purple-600"
                style={{ width: `${filled}%` }}
            />
        </div>
    );
}
