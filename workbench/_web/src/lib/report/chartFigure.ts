/**
 * A chart as a report shows it: the nnsightful snapshot spec that draws it
 * from its saved data and UI state, or why it can't be drawn. Shared by the
 * report's chart embeds (live static widgets) and its PDF export (snapshots),
 * so both show the same thing.
 */

import type {
    ActivationPatchingData,
    ActivationPatchingMode,
    ChartSnapshotSpec,
    LogitLensData,
    LogitLensUIState,
} from "nnsightful";
import { normalizeToolType, toolTypes } from "@/types/charts";

/** Why a report can't draw a chart. */
export type ChartFigureGap = "missing" | "not-run" | "unsupported" | "retired";

export type ChartFigure =
    | { spec: ChartSnapshotSpec; gap?: never }
    | { spec?: never; gap: ChartFigureGap };

type Row = { type?: string | null; data?: unknown } | null | undefined;

const AP_MODES = new Set<string>(["probability", "rank", "prob_diff"]);

function hasData(data: unknown): data is Record<string, unknown> {
    return data != null && typeof data === "object" && Object.keys(data).length > 0;
}

/**
 * What a report draws for `chart` (a charts row) with its `config` (its
 * configs row). The tool is the config's type, else the chart's own (null
 * until it first runs); legacy type names are normalized.
 */
export function chartFigure(chart: Row, config: Row): ChartFigure {
    if (!chart) return { gap: "missing" };
    const tool = normalizeToolType(config?.type ?? chart.type ?? null);
    if (tool != null && !(toolTypes as readonly string[]).includes(tool)) return { gap: "retired" };
    if (!hasData(chart.data)) return { gap: "not-run" };
    const settings = (config?.data ?? {}) as Record<string, unknown>;

    switch (tool) {
        case "logit-lens":
        case "jlens":
            if (!("meta" in chart.data)) return { gap: "not-run" };
            return {
                spec: {
                    kind: "logit-lens",
                    data: chart.data as unknown as LogitLensData,
                    uiState: (settings.uiState as LogitLensUIState | undefined) ?? null,
                },
            };
        case "activation-patching": {
            const lines = (chart.data as { lines?: unknown }).lines;
            if (!Array.isArray(lines) || lines.length === 0) return { gap: "not-run" };
            const mode = settings.selectedMode;
            const selected = settings.selectedLineIndices;
            return {
                spec: {
                    kind: "activation-patching",
                    data: chart.data as unknown as ActivationPatchingData,
                    mode:
                        typeof mode === "string" && AP_MODES.has(mode)
                            ? (mode as ActivationPatchingMode)
                            : "probability",
                    selectedTokens: Array.isArray(selected) ? (selected as number[]) : undefined,
                },
            };
        }
        default:
            // Patch Lens renders with edulogitlens, not nnsightful.
            return { gap: "unsupported" };
    }
}

/** One line on why a chart isn't drawn; `toolLabel` names its tool. */
export function chartFigureGapText(gap: ChartFigureGap, toolLabel?: string): string {
    switch (gap) {
        case "missing":
            return "This chart was deleted.";
        case "not-run":
            return "This chart hasn't been run yet.";
        case "retired":
            return "This chart was made with a retired tool.";
        case "unsupported":
            return `${toolLabel ?? "These"} charts can't be shown in reports yet.`;
    }
}
