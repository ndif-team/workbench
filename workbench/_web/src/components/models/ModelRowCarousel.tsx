"use client";

import { useCallback, useEffect, useRef, useState, type Ref } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ModelCard, type ModelCardModel } from "./ModelCard";

// Max columns visible at once (the widest breakpoint). Kept in sync with the
// `lg:[--cols:4]` grid class below — the row-count heuristic assumes this many
// columns. Change both together.
const MAX_VISIBLE_COLS = 4;

/**
 * Scroll state + paging for the model carousel, lifted out of the grid so the
 * nav controls can render elsewhere (the section header). Pass a value that
 * changes when the content does (e.g. the model list) to re-measure on change.
 *
 * `scrollRef` is a **callback ref** (not a ref object) so the scroll/resize
 * listeners re-attach every time the grid element mounts — the carousel is
 * conditionally rendered (hidden while the section is collapsed), so on reopen
 * a fresh element mounts and must be re-measured, or the controls stay hidden.
 */
export function useCarouselScroll(deps?: unknown) {
    const elRef = useRef<HTMLDivElement | null>(null);
    const cleanupRef = useRef<(() => void) | null>(null);
    const pageWidthRef = useRef(0);
    const [progress, setProgress] = useState(0);
    const [hasOverflow, setHasOverflow] = useState(false);

    const measure = useCallback(() => {
        const el = elRef.current;
        if (!el) return;
        const max = el.scrollWidth - el.clientWidth;
        setHasOverflow(max > 1);
        setProgress(max > 0 ? el.scrollLeft / max : 0);
        pageWidthRef.current = el.clientWidth;
    }, []);

    const scrollRef = useCallback(
        (el: HTMLDivElement | null) => {
            // Tear down the previous element's listeners before (re)binding.
            cleanupRef.current?.();
            cleanupRef.current = null;
            elRef.current = el;
            if (!el) {
                // Detached (e.g. the section collapsed, or the list filtered to
                // zero and the carousel was swapped out) — clear the state so
                // the header's nav controls hide instead of lingering.
                setHasOverflow(false);
                setProgress(0);
                return;
            }
            measure();
            el.addEventListener("scroll", measure, { passive: true });
            const ro = new ResizeObserver(measure);
            ro.observe(el);
            cleanupRef.current = () => {
                el.removeEventListener("scroll", measure);
                ro.disconnect();
            };
        },
        [measure],
    );

    // Content growth changes scrollWidth without resizing the container, so the
    // ResizeObserver alone misses it — re-measure when the list changes.
    useEffect(() => {
        measure();
    }, [deps, measure]);

    // Page by the visible width — one click moves by ~one full screen of cards.
    const scrollByPage = (dir: -1 | 1) =>
        elRef.current?.scrollBy({ left: dir * pageWidthRef.current, behavior: "smooth" });

    return { scrollRef, progress, hasOverflow, scrollByPage };
}

/** Progress bar + left/right paging buttons. Rendered in the section header. */
export function CarouselControls({
    progress,
    scrollByPage,
    label = "models",
}: {
    progress: number;
    scrollByPage: (dir: -1 | 1) => void;
    label?: string;
}) {
    return (
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
    );
}

interface ModelRowCarouselProps {
    models: ModelCardModel[];
    /** Max stacked rows in the column-major grid (once there are enough cards
     * to fill a second/third row). Defaults to 2. */
    rows?: number;
    /** Scroll state from `useCarouselScroll` (owned by the parent so the nav
     * controls can live in the section header). `scrollRef` is a callback ref. */
    scrollRef: Ref<HTMLDivElement>;
    progress: number;
    hasOverflow: boolean;
    onCardClick?: (m: ModelCardModel) => void;
    cardHref?: (m: ModelCardModel) => string | undefined;
}

/**
 * Horizontal scroller with a column-major grid (cards stack vertically down
 * `rows` then progress horizontally). The viewport is sized so exactly 4 columns
 * are visible at `lg+` breakpoints (3 at md, 2 at sm, 1 below); anything past
 * that is reachable by scrolling. The nav controls (progress + arrows) live in
 * the section header via `CarouselControls`; this renders the grid + edge fades.
 */
export function ModelRowCarousel({
    models,
    rows = 2,
    scrollRef,
    progress,
    hasOverflow,
    onCardClick,
    cardHref,
}: ModelRowCarouselProps) {
    return (
        <div className="relative">
            <div
                ref={scrollRef}
                className={cn(
                    "grid gap-3 overflow-x-auto py-0.5",
                    "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                    // Card column width: container split into 1 / 2 / 3 / 4
                    // visible columns by breakpoint (see MAX_VISIBLE_COLS). The
                    // math accounts for (N-1) gaps inside the visible viewport.
                    "[--cols:1] sm:[--cols:2] md:[--cols:3] lg:[--cols:4]",
                )}
                style={{
                    gridAutoFlow: "column",
                    // Stack into as many rows as the cards need (assuming the
                    // widest breakpoint's column count), capped at `rows`. Few
                    // cards stay a single line instead of leaving empty rows.
                    gridTemplateRows: `repeat(${Math.min(rows, Math.max(1, Math.ceil(models.length / MAX_VISIBLE_COLS)))}, auto)`,
                    // Cap each card at 268px so cards don't stretch hollow on
                    // wide viewports, while still shrinking below the cap at
                    // small viewports.
                    gridAutoColumns:
                        "min(268px, calc((100% - (var(--cols) - 1) * 12px) / var(--cols)))",
                }}
            >
                {/* The caller (ModelsSection) renders its own empty state and
                    only mounts this with a non-empty list. */}
                {models.map((m) => (
                    <ModelCard
                        key={`${m.org}/${m.name}`}
                        m={m}
                        onClick={onCardClick ? () => onCardClick(m) : undefined}
                        href={cardHref?.(m)}
                    />
                ))}
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
