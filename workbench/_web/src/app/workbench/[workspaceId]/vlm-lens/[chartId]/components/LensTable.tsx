"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { useVlmLensView } from "@/stores/useVlmLensView";

interface Props {
    chartId: string;
    inputTokens: string[];
    topk: [string, string][][][];
    numLayers: number;
}

const ROW_HIGHLIGHT_CLASS = "bg-primary/10";

/**
 * Sticky-header lens table. ~19k cells, so it's the hot spot for hover
 * perf: we deliberately do NOT subscribe to the cross-panel store via a
 * React selector — that would re-render every cell on every patch. Instead
 * we subscribe imperatively, toggle the highlighted row's className via a
 * ref, and read isLocked synchronously at click time. The body renders
 * once per (inputTokens, topk, numLayers) change.
 */
export function LensTable({ chartId, inputTokens, topk, numLayers }: Props) {
    const scrollerRef = useRef<HTMLDivElement>(null);
    const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

    // Stable cell handlers — read isLocked from the store at call time so the
    // closures don't need to be regenerated when isLocked flips.
    const patch = useVlmLensView((s) => s.patch);
    const onCellEnter = useCallback(
        (pos: number, layer: number) => {
            if (useVlmLensView.getState().byChart[chartId]?.isLocked) return;
            patch(chartId, { hoveredPos: pos, hoveredLayer: layer });
        },
        [chartId, patch],
    );
    const onCellLeave = useCallback(() => {
        if (useVlmLensView.getState().byChart[chartId]?.isLocked) return;
        patch(chartId, { hoveredPos: null, hoveredLayer: null });
    }, [chartId, patch]);
    const onContainerClick = useCallback(() => {
        if (!useVlmLensView.getState().byChart[chartId]?.isLocked) return;
        patch(chartId, { isLocked: false, hoveredPos: null, hoveredLayer: null });
    }, [chartId, patch]);

    // Imperative hoveredPos -> row className + scroll. No React re-render.
    useEffect(() => {
        let prev: number | null = null;
        const apply = (cur: number | null) => {
            if (cur === prev) return;
            if (prev !== null) {
                rowRefs.current.get(prev)?.classList.remove(ROW_HIGHLIGHT_CLASS);
            }
            if (cur !== null) {
                const row = rowRefs.current.get(cur);
                row?.classList.add(ROW_HIGHLIGHT_CLASS);
                const scroller = scrollerRef.current;
                if (row && scroller) {
                    const rTop = row.offsetTop;
                    const rBottom = rTop + row.offsetHeight;
                    const sTop = scroller.scrollTop;
                    const sBottom = sTop + scroller.clientHeight;
                    if (rTop < sTop) {
                        scroller.scrollTo({ top: rTop, behavior: "smooth" });
                    } else if (rBottom > sBottom) {
                        scroller.scrollTo({
                            top: rBottom - scroller.clientHeight,
                            behavior: "smooth",
                        });
                    }
                }
            }
            prev = cur;
        };
        apply(useVlmLensView.getState().byChart[chartId]?.hoveredPos ?? null);
        const unsub = useVlmLensView.subscribe((state) =>
            apply(state.byChart[chartId]?.hoveredPos ?? null),
        );
        return unsub;
    }, [chartId]);

    // The table body is the expensive part; memoize on its real inputs.
    const body = useMemo(
        () => (
            <tbody>
                {inputTokens.map((label, pos) => (
                    <tr
                        key={pos}
                        ref={(el) => {
                            if (el) rowRefs.current.set(pos, el);
                            else rowRefs.current.delete(pos);
                        }}
                    >
                        <th
                            scope="row"
                            className="sticky left-0 z-10 bg-secondary border-b border-r px-2 py-1 text-left font-mono font-normal whitespace-pre"
                        >
                            {label}
                        </th>
                        {Array.from({ length: numLayers }, (_, layer) => {
                            const top1 = topk[layer]?.[pos]?.[0]?.[0] ?? "";
                            return (
                                <td
                                    key={layer}
                                    className="border-b border-r px-2 py-1 text-center font-mono cursor-default whitespace-nowrap"
                                    onMouseEnter={() => onCellEnter(pos, layer)}
                                    onMouseLeave={onCellLeave}
                                >
                                    {top1}
                                </td>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        ),
        [inputTokens, topk, numLayers, onCellEnter, onCellLeave],
    );

    return (
        <div
            ref={scrollerRef}
            className="size-full overflow-auto min-w-0"
            onClick={onContainerClick}
        >
            <table className="border-separate border-spacing-0 text-xs">
                <thead>
                    <tr>
                        <th className="sticky top-0 left-0 z-30 bg-secondary border-b border-r px-2 py-1 text-left font-medium min-w-[120px]">
                            Token / Layer
                        </th>
                        {Array.from({ length: numLayers }, (_, i) => (
                            <th
                                key={i}
                                className="sticky top-0 z-20 bg-secondary border-b border-r px-2 py-1 font-medium min-w-[80px] text-center"
                            >
                                L{i + 1}
                            </th>
                        ))}
                    </tr>
                </thead>
                {body}
            </table>
        </div>
    );
}
