import { useEffect, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { useWorkspace } from "@/stores/useWorkspace";
import { useModelsQuery } from "@/lib/api/modelsApi";
import { isModelRunnable } from "@/components/model-selector/status";

interface ConfigWithModel {
    id: string;
    data: { model?: string };
    type: string;
}

interface ChartWithMaybeData {
    id: string;
    data?: unknown;
    type: string;
}

interface UseToolAreaResult<TConfig extends ConfigWithModel, TChart extends ChartWithMaybeData> {
    config: TConfig | undefined;
    chart: TChart | undefined;
    isChartLoading: boolean;
    models: ReturnType<typeof useModelsQuery>["data"];
    modelsFetching: boolean;
    modelsAvailable: boolean;
    /** The model name to use for tokenization / display. Prefers the
     * workspace's selected model; falls back to the saved config's model
     * when models are unavailable so the panel can still render the saved
     * shape in read-only mode. */
    effectiveModel: string;
    hasExistingData: boolean;
    /** Whether `effectiveModel` is currently runnable (hot/warm). False when
     * the model has gone cold or left the catalog — the Controls should be
     * read-only in that case (the saved chart still renders via the Display). */
    modelRunnable: boolean;
}

/**
 * Shared Area-level data-fetch + model-sync logic used by every interpretability
 * tool's `*Area` component.
 *
 * Loads the chart and its config, the workspace model list, then syncs the
 * workspace's selected model to the chart's saved model on chart change so
 * the header pill matches the loaded chart by default.
 *
 * Each tool's Area is now a thin shell around this hook + the tool-specific
 * Controls component.
 */
export function useToolArea<
    TConfig extends ConfigWithModel,
    TChart extends ChartWithMaybeData,
>(): UseToolAreaResult<TConfig, TChart> {
    const { chartId } = useParams<{ chartId: string }>();

    const { data: config } = useQuery({
        queryKey: queryKeys.charts.configByChart(chartId),
        queryFn: () => getConfigForChart(chartId),
        enabled: !!chartId,
    });

    const { data: chart, isLoading: isChartLoading } = useQuery({
        queryKey: queryKeys.charts.chart(chartId),
        queryFn: () => getChartById(chartId as string),
        enabled: !!chartId,
    });

    const { selectedModelIdx, setSelectedModelIdx } = useWorkspace();

    const { data: models, isFetching: modelsFetching } = useModelsQuery();

    const typedConfig = config as TConfig | undefined;
    const typedChart = chart as TChart | undefined;

    // Sync the workspace's selected model to the chart's saved model ONCE per
    // chart (when its config first loads / the catalog first becomes available).
    // Without the per-chart guard this would re-fire on every background models
    // refetch (the `select` returns a fresh array identity each time) and stomp
    // the user's manual model switch every ~60s. Reads hoisted primitives (not
    // the whole config object) so the effect only re-runs on real changes.
    const configId = typedConfig?.id;
    const configModel = typedConfig?.data?.model;
    const syncedChartIdRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (!configId || !configModel || !models || models.length === 0) return;
        if (syncedChartIdRef.current === configId) return;
        const idx = models.findIndex((m) => m.name === configModel);
        if (idx !== -1) {
            setSelectedModelIdx(idx);
            syncedChartIdRef.current = configId;
        }
    }, [configId, configModel, models, setSelectedModelIdx]);

    const modelsAvailable = !!models && models.length > 0;
    const effectiveModel = useMemo(() => {
        if (modelsAvailable) {
            return models![selectedModelIdx]?.name ?? models![0].name;
        }
        return typedConfig?.data?.model ?? "";
    }, [modelsAvailable, models, selectedModelIdx, typedConfig?.data?.model]);

    const hasExistingData = !!typedChart?.data;

    const modelRunnable = useMemo(
        () => isModelRunnable(models?.find((m) => m.name === effectiveModel)),
        [models, effectiveModel],
    );

    return {
        config: typedConfig,
        chart: typedChart,
        isChartLoading,
        models,
        modelsFetching,
        modelsAvailable,
        effectiveModel,
        hasExistingData,
        modelRunnable,
    };
}
