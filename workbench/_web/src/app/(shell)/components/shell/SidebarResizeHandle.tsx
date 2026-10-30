"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { cn } from "@/lib/utils";
import { SIDEBAR_WIDTH, clampSidebarWidth } from "./sidebarCookie";

/** How far one arrow key press moves the edge, in px. */
const KEY_STEP = 16;

/**
 * The expanded sidebar's right edge: drag it to set the sidebar's width,
 * double-click it to go back to the default. It is a focusable splitter, so
 * the arrow keys move it too, and Home and End take it to its limits.
 * `onResize` follows the drag; `onResizeEnd` gets the width it settles on.
 */
export function SidebarResizeHandle({
    width,
    controls,
    onResize,
    onResizeEnd,
}: {
    width: number;
    /** The sidebar's element id. */
    controls: string;
    onResize: (width: number) => void;
    onResizeEnd: (width: number) => void;
}) {
    const drag = useRef<{ x: number; width: number } | null>(null);
    const [dragging, setDragging] = useState(false);
    const widthAt = (e: PointerEvent) =>
        drag.current ? clampSidebarWidth(drag.current.width + e.clientX - drag.current.x) : width;

    const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, width };
        setDragging(true);
    };
    const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
        if (drag.current) onResize(widthAt(e));
    };
    const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
        if (!drag.current) return;
        onResizeEnd(widthAt(e));
        drag.current = null;
        setDragging(false);
    };

    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        const next = {
            ArrowLeft: width - KEY_STEP,
            ArrowRight: width + KEY_STEP,
            Home: SIDEBAR_WIDTH.min,
            End: SIDEBAR_WIDTH.max,
        }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        onResizeEnd(clampSidebarWidth(next));
    };

    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            aria-controls={controls}
            aria-valuenow={width}
            aria-valuemin={SIDEBAR_WIDTH.min}
            aria-valuemax={SIDEBAR_WIDTH.max}
            tabIndex={0}
            data-dragging={dragging || undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={() => onResizeEnd(SIDEBAR_WIDTH.default)}
            onKeyDown={onKeyDown}
            className={cn(
                "absolute inset-y-0 -right-2 z-10 w-2 cursor-col-resize outline-none",
                "after:absolute after:inset-y-0 after:left-0 after:w-0.5 after:transition-colors",
                "hover:after:bg-primary/40 focus-visible:after:bg-primary data-[dragging]:after:bg-primary/60",
            )}
        />
    );
}
