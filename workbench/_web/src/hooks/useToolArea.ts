import { useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { useWorkspace } from "@/stores/useWorkspace";
import { useModelsQuery } from "@/lib/api/modelsApi";

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

    useEffect(() => {
        if (!typedConfig || !models || models.length === 0) return;
        const configModel = typedConfig.data?.model;
        if (!configModel) return;
        const idx = models.findIndex((m) => m.name === configModel);
        if (idx !== -1) setSelectedModelIdx(idx);
    }, [typedConfig?.id, models, setSelectedModelIdx, typedConfig]);

    const modelsAvailable = !!models && models.length > 0;
    const effectiveModel = useMemo(() => {
        if (modelsAvailable) {
            return models![selectedModelIdx]?.name ?? models![0].name;
        }
        return typedConfig?.data?.model ?? "";
    }, [modelsAvailable, models, selectedModelIdx, typedConfig?.data?.model]);

    const hasExistingData = !!typedChart?.data;

    return {
        config: typedConfig,
        chart: typedChart,
        isChartLoading,
        models,
        modelsFetching,
        modelsAvailable,
        effectiveModel,
        hasExistingData,
    };
}
