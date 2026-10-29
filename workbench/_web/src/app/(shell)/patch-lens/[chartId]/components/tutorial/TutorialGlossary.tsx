"use client";

import { BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { GlossaryEntry } from "@/types/tutorial-content";

/**
 * The tutorial's persistent reference: every term the units use, plus one
 * annotated heatmap, reachable from the panel header on every step.
 *
 * Each term is otherwise explained once, in prose, in the unit that first needs
 * it — so "cell" explained in the first step is unreachable by the step that says
 * "drag a cell", and the entry cost of the tool lands entirely on the first two
 * minutes. Opening this costs one click and leaves the step in place.
 */

export function TutorialGlossary({
    entries,
    onOpen,
}: {
    entries: GlossaryEntry[];
    onOpen?: () => void;
}) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    // Anchor for the orientation walkthrough, which calls this
                    // button out — the pilot's clearest request was for the terms,
                    // and an unadvertised icon button doesn't answer it.
                    id="tutorial-glossary"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
                    title="What do these words mean?"
                    aria-label="Glossary and how to read the heatmap"
                    // Keep the header's drag gesture from swallowing the tap.
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => onOpen?.()}
                >
                    <BookOpen className="h-3.5 w-3.5" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                side="bottom"
                className="w-80 max-h-[70vh] overflow-auto p-3"
            >
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                        <h3 className="text-sm font-medium">How to read the heatmap</h3>
                        <HeatmapAnatomy />
                        <p className="text-xs text-muted-foreground leading-snug">
                            Each cell is what the model would say next if it stopped at that layer.
                            The bottom-right cell is what it actually said.
                        </p>
                    </div>
                    <div className="flex flex-col gap-2 border-t pt-3">
                        <h3 className="text-sm font-medium">What do these words mean?</h3>
                        <dl className="flex flex-col gap-2">
                            {entries.map((e) => (
                                <div key={e.term}>
                                    <dt className="text-xs font-medium">{e.term}</dt>
                                    <dd className="text-xs text-muted-foreground leading-snug">
                                        {e.definition}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

// Grid geometry, in viewBox units. Rows are token positions (top to bottom, the
// order they were typed); columns are layers (earliest on the left) — the same
// orientation the widget renders, so the diagram and the tool agree.
const COLS = 6;
const ROWS = 5;
const X0 = 34;
const Y0 = 26;
const COL_W = 33;
const ROW_H = 20;
const CELL_W = 30;
const CELL_H = 17;

/**
 * One labelled heatmap: which axis is layers, which is your text, and which cell
 * is the answer. Cheaper than the video tutorial people keep asking for, and it
 * covers the same ground as the first thirty seconds of one.
 */
function HeatmapAnatomy() {
    const lastCol = X0 + (COLS - 1) * COL_W;
    const lastRow = Y0 + (ROWS - 1) * ROW_H;
    return (
        <svg
            // Height stops just past the answer label, so the diagram doesn't sit
            // on a band of empty space above the caption.
            viewBox="0 0 300 130"
            width="100%"
            role="img"
            aria-label="A heatmap: rows are the tokens of your text, columns are layers from earliest on the left to last on the right, and the bottom-right cell is the model's answer."
            className="text-muted-foreground"
        >
            {/* Layer axis */}
            <text x={X0} y={9} fontSize={9} fill="currentColor">
                layers: earliest → last
            </text>
            <line
                x1={X0}
                y1={16}
                x2={lastCol + CELL_W}
                y2={16}
                stroke="currentColor"
                strokeWidth={0.75}
                opacity={0.5}
            />
            {/* Token axis */}
            <text
                x={0}
                y={0}
                fontSize={9}
                fill="currentColor"
                transform={`translate(11 ${Y0 + (ROWS * ROW_H) / 2}) rotate(-90)`}
                textAnchor="middle"
            >
                one row per token
            </text>

            {Array.from({ length: ROWS }).map((_, row) =>
                Array.from({ length: COLS }).map((_, col) => {
                    const isAnswer = row === ROWS - 1 && col === COLS - 1;
                    return (
                        <rect
                            key={`${row}-${col}`}
                            x={X0 + col * COL_W}
                            y={Y0 + row * ROW_H}
                            width={CELL_W}
                            height={CELL_H}
                            rx={2}
                            className={isAnswer ? "fill-primary stroke-primary" : undefined}
                            fill={isAnswer ? undefined : "currentColor"}
                            // Later layers read as more confident, which is the
                            // pattern the first unit asks the participant to notice.
                            opacity={isAnswer ? 1 : 0.1 + col * 0.04}
                            strokeWidth={isAnswer ? 1.5 : 0}
                        />
                    );
                }),
            )}

            {/* The cell every check asks about */}
            <line
                x1={lastCol + CELL_W + 2}
                y1={lastRow + CELL_H / 2}
                x2={lastCol + CELL_W + 12}
                y2={lastRow + CELL_H / 2}
                stroke="currentColor"
                strokeWidth={0.75}
            />
            <text
                x={lastCol + CELL_W + 15}
                y={lastRow + CELL_H / 2 - 1}
                fontSize={9}
                fill="currentColor"
            >
                the model&apos;s
            </text>
            <text
                x={lastCol + CELL_W + 15}
                y={lastRow + CELL_H / 2 + 9}
                fontSize={9}
                fill="currentColor"
            >
                answer
            </text>
        </svg>
    );
}
