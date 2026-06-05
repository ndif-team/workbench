"use client";

import { useQuery } from "@tanstack/react-query";

import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { useModelsQuery } from "@/lib/api/modelsApi";
import { useModelDeployment } from "@/stores/useModelDeployment";
import {
    isModelRunnable,
    isModelCold,
    isModelDeploying,
} from "@/components/model-selector/status";
import type { DeploymentPhase } from "@/types/deployment";

/** Tool-agnostic "does this chart have a renderable result?" check. */
function chartHasData(data: unknown): boolean {
    if (!data || typeof data !== "object") return false;
    const d = data as Record<string, unknown>;
    if ("meta" in d) return true; // lens2
    if ("lines" in d) return Array.isArray(d.lines) && d.lines.length > 0; // AP
    return false;
}

export type ChartModelReadiness =
    | { state: "loading"; modelName: string | null }
    | { state: "ready"; modelName: string }
    | { state: "deploying"; modelName: string; phase: DeploymentPhase };

/**
 * Centralized "is this chart's saved model runnable?" check. Returns:
 *  - `loading`   — config/models not yet known
 *  - `ready`     — model is hot/warm, OR an in-flight deployment COMPLETED
 *  - `deploying` — model is cold or a warmup is in progress/failed; the chart
 *                  should show the deploying panel instead of controls/viz
 *
 * Treating the deployment store's `ready` phase as authoritative means the
 * chart flips to runnable the moment the warmup job COMPLETES, without waiting
 * for the backend catalog cache to refresh to HOT.
 */
export function useChartModelReady(chartId: string): ChartModelReadiness {
    const { data: config, isLoading: configLoading } = useQuery({
        queryKey: queryKeys.charts.configByChart(chartId),
        queryFn: () => getConfigForChart(chartId),
        enabled: !!chartId,
    });

    const { data: chart, isLoading: chartLoading } = useQuery({
        queryKey: queryKeys.charts.chart(chartId),
        queryFn: () => getChartById(chartId),
        enabled: !!chartId,
    });

    const { data: models, isLoading: modelsLoading } = useModelsQuery();

    const modelName: string | null =
        (config as { data?: { model?: string } } | undefined)?.data?.model ?? null;

    const phase = useModelDeployment((s) =>
        modelName ? s.deployments[modelName]?.phase ?? "idle" : "idle",
    );

    if (configLoading || chartLoading || (modelsLoading && !models)) {
        return { state: "loading", modelName };
    }

    // No model on the config (shouldn't happen for a real chart) — let the
    // normal UI handle it rather than gating.
    if (!modelName) return { state: "ready", modelName: "" };

    if (phase === "ready") return { state: "ready", modelName };

    const catalogModel = models?.find((m) => m.name === modelName);

    if (isModelRunnable(catalogModel)) return { state: "ready", modelName };

    // Fallback: if the chart already has a saved result, always show it
    // (read-only) rather than hiding it behind the deploying panel — even if
    // its model has since gone cold or left the catalog. Only charts with no
    // renderable data get the deploying panel.
    const hasData = chartHasData((chart as { data?: unknown } | undefined)?.data);
    if (hasData) return { state: "ready", modelName };

    // No data + cold model, NDIF mid-load, or a warmup in progress/errored →
    // deploying panel.
    if (isModelCold(catalogModel) || isModelDeploying(catalogModel) || phase !== "idle") {
        // If NDIF already reports the model mid-load but we have no local
        // warmup tracked (e.g. another user triggered it), surface it as
        // in-progress so the panel shows "Deploying…" instead of an idle
        // "Not deployed" with a redundant Deploy button.
        const effectivePhase: DeploymentPhase =
            phase === "idle" && isModelDeploying(catalogModel) ? "deploying" : phase;
        return { state: "deploying", modelName, phase: effectivePhase };
    }

    // Model isn't cold and isn't in the catalog as runnable (e.g. unknown /
    // not deployed at all) and there's no data — don't gate.
    return { state: "ready", modelName };
}
