"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The models grid's page controls: previous, a progress bar, next. */
export function ModelsPager({
    page,
    pageCount,
    onPage,
}: {
    /** The page on screen, from 0. */
    page: number;
    pageCount: number;
    onPage: (page: number) => void;
}) {
    const filled = Math.min(100, 24 + (page / Math.max(1, pageCount - 1)) * 76);
    return (
        <nav aria-label="Model pages" className="flex items-center gap-2">
            <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-6 w-6"
                onClick={() => onPage(page - 1)}
                disabled={page <= 0}
                aria-label="Previous page"
            >
                <ChevronLeft className="h-3 w-3" />
            </Button>
            <div className="relative h-1 w-24 overflow-hidden rounded-full bg-muted lg:w-[140px]">
                <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-purple-600"
                    style={{ width: `${filled}%` }}
                />
            </div>
            <span className="sr-only" aria-live="polite">
                Page {page + 1} of {pageCount}
            </span>
            <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-6 w-6"
                onClick={() => onPage(page + 1)}
                disabled={page >= pageCount - 1}
                aria-label="Next page"
            >
                <ChevronRight className="h-3 w-3" />
            </Button>
        </nav>
    );
}
