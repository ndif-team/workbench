"use client";

import { useMemo } from "react";
import {
    ActivationPatchingWidget,
    LogitLensWidget,
    type ChartSnapshotSpec,
    type LogitLensRowWindow,
} from "nnsightful";
import { REPORT_MAX_ROWS } from "@/lib/report/chartFigure";

/**
 * A chart drawn from its saved data and UI state, as a static picture: the
 * same rendering a PDF export snapshots. The widget ignores the pointer, so
 * clicks fall through to the embed around it. A long logit lens shows a
 * window of REPORT_MAX_ROWS rows (from `rowStart`), which scrolls to choose
 * the rows the report shows, only while `active` (the embed is selected):
 * otherwise scrolling over it scrolls the report.
 */
export function EmbeddedChart({
    spec,
    darkMode,
    rowStart,
    active,
    onRowWindowChange,
}: {
    spec: ChartSnapshotSpec;
    darkMode: boolean;
    rowStart: number | null;
    active: boolean;
    onRowWindowChange: (window: LogitLensRowWindow | null, source: "render" | "scroll") => void;
}) {
    const lensState = spec.kind === "logit-lens" ? spec.uiState : null;
    // Memoized: a new object would make the widget re-apply its state.
    const uiState = useMemo(() => ({ ...lensState, rowStart }), [lensState, rowStart]);

    if (spec.kind === "logit-lens") {
        return (
            <LogitLensWidget
                data={spec.data}
                uiState={uiState}
                darkMode={darkMode}
                interactive={false}
                maxRows={REPORT_MAX_ROWS}
                scrollRows
                scrollRowsActive={active}
                onRowWindowChange={onRowWindowChange}
                className="w-full"
            />
        );
    }
    return (
        <div className="h-80 w-full">
            <ActivationPatchingWidget
                data={spec.data}
                mode={spec.mode}
                selectedTokens={spec.selectedTokens}
                darkMode={darkMode}
                transparentBackground
                interactive={false}
            />
        </div>
    );
}
