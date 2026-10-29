"use client";

import { useCallback, useMemo } from "react";

import { useModelDeployment } from "@/stores/useModelDeployment";
import { useModelsQuery } from "@/lib/api/modelsApi";
import { isChartModelDeploying } from "@/hooks/useChartModelReady";
import { isModelDeploying } from "@/components/model-selector/status";
import type { DeployCardState } from "./DeployCard";

/**
 * Which deploy state a chart's sidebar row shows, if any: "cold" (model not
 * deployed), "deploying" or "failed". Derived from the same sources as the
 * chart page's deploying panel (the saved model, the live catalog heat and the
 * deployment store), so the sidebar and the page never disagree, e.g. after a
 * reload has cleared the store.
 */
export function useDeployStateOf() {
    const deployments = useModelDeployment((s) => s.deployments);
    const { data: models } = useModelsQuery();
    const modelByName = useMemo(() => new Map((models ?? []).map((m) => [m.name, m])), [models]);

    return useCallback(
        (chart: { model: string | null | undefined; hasData: boolean }): DeployCardState | null => {
            if (!chart.model) return null;
            const phase = deployments[chart.model]?.phase ?? "idle";
            const catalogModel = modelByName.get(chart.model);
            if (!isChartModelDeploying(catalogModel, phase, chart.hasData)) return null;
            if (phase === "error") return "failed";
            if (phase === "submitting" || phase === "deploying" || isModelDeploying(catalogModel)) {
                return "deploying";
            }
            return "cold";
        },
        [deployments, modelByName],
    );
}
