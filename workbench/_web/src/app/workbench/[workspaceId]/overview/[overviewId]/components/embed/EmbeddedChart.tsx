"use client";

import { ActivationPatchingWidget, LogitLensWidget, type ChartSnapshotSpec } from "nnsightful";

/**
 * A chart drawn from its saved data and UI state, as a static picture: the
 * same rendering a PDF export snapshots. The widget ignores the pointer, so
 * clicks fall through to the embed around it.
 */
export function EmbeddedChart({ spec, darkMode }: { spec: ChartSnapshotSpec; darkMode: boolean }) {
    if (spec.kind === "logit-lens") {
        return (
            <LogitLensWidget
                data={spec.data}
                uiState={spec.uiState ?? undefined}
                darkMode={darkMode}
                interactive={false}
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
