import config from "@/lib/config";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    setChartData,
    deleteChart,
    createLens2ChartPair,
    createJLensChartPair,
    createPatchLensChartPair,
    createPatchChartPair,
    createActivationPatchingChartPair,
    convertLens2ChartInPlace,
    convertJLensChartInPlace,
    convertActivationPatchingChartInPlace,
    convertPatchLensChartInPlace,
    updateChartName,
    updateChartView,
    copyChart,
} from "@/lib/queries/chartQueries";
import { LensConfigData } from "@/types/lens";
import { Lens2ConfigData } from "@/types/lens2";
import { JLensConfigData } from "@/types/jlens";
import { PatchingConfig } from "@/types/patching";
import { ActivationPatchingConfigData } from "@/types/activationPatching";
import { useCapture } from "@/components/providers/CaptureProvider";
import { Line, HeatmapRow, ChartView } from "@/types/charts";
import { queryKeys } from "../queryKeys";
import { toast } from "sonner";
import { startAndPoll } from "../startAndPoll";
import { useHeatmapView, useLineView } from "@/components/charts/ViewProvider";
import { createUserHeadersAction } from "@/actions/auth";

const getLensLine = async (lensRequest: { completion: LensConfigData; chartId: string }) => {
    const headers = await createUserHeadersAction();

    // Transform LensConfigData to LensLineRequest format
    const lineRequest = {
        model: lensRequest.completion.model,
        stat: lensRequest.completion.statisticType,
        prompt: lensRequest.completion.prompt,
        token: lensRequest.completion.token,
    };

    return await startAndPoll<Line[]>(
        config.endpoints.startLensLine,
        lineRequest,
        config.endpoints.resultsLensLine,
        headers,
    );
};

export const useLensLine = () => {
    const queryClient = useQueryClient();
    const { clearView } = useLineView();
    const { captureChartThumbnail } = useCapture();

    return useMutation({
        mutationKey: ["lensLine"],
        onMutate: async ({
            lensRequest,
        }: {
            lensRequest: { completion: LensConfigData; chartId: string };
            configId: string;
        }) => {
            const chartKey = queryKeys.charts.chart(lensRequest.chartId);
            await queryClient.cancelQueries({ queryKey: chartKey });
            const previousChart = queryClient.getQueryData(chartKey);
            queryClient.setQueryData(chartKey, (old: any) => {
                if (!old) return old;
                return { ...old, type: "line" };
            });
            return { previousChart, chartKey } as {
                previousChart: unknown;
                chartKey: ReturnType<typeof queryKeys.charts.chart>;
            };
        },
        mutationFn: async ({
            lensRequest,
            configId,
        }: {
            lensRequest: { completion: LensConfigData; chartId: string };
            configId: string;
        }) => {
            const response = await getLensLine(lensRequest);
            await setChartData(lensRequest.chartId, response, "line");
            return response;
        },
        onError: (error, variables, context) => {
            if (context?.previousChart) {
                queryClient.setQueryData(context.chartKey, context.previousChart as any);
            }
            toast.error("Failed to compute lens line (timeout or error)");
        },
        onSuccess: async (data, variables) => {
            await clearView();
            const chartKey = queryKeys.charts.chart(variables.lensRequest.chartId);
            queryClient
                .invalidateQueries({
                    queryKey: chartKey,
                })
                .then(() => {
                    setTimeout(() => {
                        captureChartThumbnail(variables.lensRequest.chartId);
                    }, 500);
                });
            // Do NOT invalidate configByChart here. Lens runs are always
            // followed by `updateConfig` (see useLensCharts handlers and
            // GenerateButton), and useUpdateChartConfig owns that invalidation.
            // Triggering it here races the in-flight config write and can cache
            // the pre-write (stale) row.
            const chart = queryClient.getQueryData(chartKey) as any;
            if (chart?.workspaceId) {
                queryClient.invalidateQueries({
                    queryKey: queryKeys.charts.sidebar(chart.workspaceId),
                });
            }
        },
    });
};

const getLensGrid = async (lensRequest: { completion: LensConfigData; chartId: string }) => {
    const headers = await createUserHeadersAction();

    // Transform LensConfigData to GridLensRequest format
    const gridRequest = {
        model: lensRequest.completion.model,
        stat: lensRequest.completion.statisticType,
        prompt: lensRequest.completion.prompt,
    };

    return await startAndPoll<HeatmapRow[]>(
        config.endpoints.startLensGrid,
        gridRequest,
        config.endpoints.resultsLensGrid,
        headers,
    );
};

export const useLensGrid = () => {
    const queryClient = useQueryClient();
    const { clearView } = useHeatmapView();
    const { captureChartThumbnail } = useCapture();

    return useMutation({
        mutationKey: ["lensGrid"],
        onMutate: async ({
            lensRequest,
        }: {
            lensRequest: { completion: LensConfigData; chartId: string };
            configId: string;
        }) => {
            const chartKey = queryKeys.charts.chart(lensRequest.chartId);
            await queryClient.cancelQueries({ queryKey: chartKey });
            const previousChart = queryClient.getQueryData(chartKey);
            queryClient.setQueryData(chartKey, (old: any) => {
                if (!old) return old;
                return { ...old, type: "heatmap" };
            });
            return { previousChart, chartKey } as {
                previousChart: unknown;
                chartKey: ReturnType<typeof queryKeys.charts.chart>;
            };
        },
        mutationFn: async ({
            lensRequest,
            configId,
        }: {
            lensRequest: { completion: LensConfigData; chartId: string };
            configId: string;
        }) => {
            const response = await getLensGrid(lensRequest);
            await setChartData(lensRequest.chartId, response, "heatmap");
            return response;
        },
        onError: (error, variables, context) => {
            if (context?.previousChart) {
                queryClient.setQueryData(context.chartKey, context.previousChart as any);
            }
            toast.error("Failed to compute grid lens (timeout or error)");
        },
        onSuccess: async (data, variables) => {
            await clearView();
            const chartKey = queryKeys.charts.chart(variables.lensRequest.chartId);
            queryClient
                .invalidateQueries({
                    queryKey: chartKey,
                })
                .then(() => {
                    setTimeout(() => {
                        captureChartThumbnail(variables.lensRequest.chartId);
                    }, 500);
                });
            // Do NOT invalidate configByChart here. Lens runs are always
            // followed by `updateConfig` (see useLensCharts handlers and
            // GenerateButton), and useUpdateChartConfig owns that invalidation.
            // Triggering it here races the in-flight config write and can cache
            // the pre-write (stale) row.
            const chart = queryClient.getQueryData(chartKey) as any;
            if (chart?.workspaceId) {
                queryClient.invalidateQueries({
                    queryKey: queryKeys.charts.sidebar(chart.workspaceId),
                });
            }
        },
    });
};

export const useUpdateChartName = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ chartId, name }: { chartId: string; name: string }) => {
            return await updateChartName(chartId, name);
        },
        onSuccess: (data, variables) => {
            const chartKey = queryKeys.charts.chart(variables.chartId);
            queryClient.invalidateQueries({ queryKey: chartKey });

            // Also invalidate sidebar to update the chart name in the card
            const chart = queryClient.getQueryData(chartKey) as
                | { workspaceId?: string }
                | undefined;
            if (chart?.workspaceId) {
                queryClient.invalidateQueries({
                    queryKey: queryKeys.charts.sidebar(chart.workspaceId),
                });
            }
        },
    });
};

export const useUpdateChartView = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ chartId, view }: { chartId: string; view: ChartView }) => {
            return await updateChartView(chartId, view);
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.chart(variables.chartId) });
        },
    });
};

export const useDeleteChart = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ chartId }: { chartId: string; workspaceId: string }) => deleteChart(chartId),
        onSuccess: (_, { workspaceId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.sidebar(workspaceId) });
        },
    });
};

// Fresh-chart defaults, shared between the create hooks and the in-place
// convert hook so a converted chart starts from the same blank state as a
// newly created one of that type.
const DEFAULT_LENS2_CONFIG: Lens2ConfigData = {
    prompt: "",
    model: "",
    topk: 5,
    includeEntropy: true,
};
const DEFAULT_JLENS_CONFIG: JLensConfigData = {
    prompt: "",
    model: "",
    topk: 5,
    includeEntropy: true,
};
const DEFAULT_ACTIVATION_PATCHING_CONFIG: ActivationPatchingConfigData = {
    model: "",
    srcPrompt: "",
    tgtPrompt: "",
    srcPos: null,
    tgtPos: null,
};

export const useCreateLens2ChartPair = () => {
    const queryClient = useQueryClient();

    const defaultConfig = DEFAULT_LENS2_CONFIG;

    return useMutation({
        mutationFn: async ({
            workspaceId,
            config = defaultConfig,
        }: {
            workspaceId: string;
            config?: Lens2ConfigData;
        }) => {
            return await createLens2ChartPair(workspaceId, config);
        },
        onSuccess: (_, { workspaceId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.sidebar(workspaceId) });
        },
    });
};

export const useCreateJLensChartPair = () => {
    const queryClient = useQueryClient();

    const defaultConfig = DEFAULT_JLENS_CONFIG;

    return useMutation({
        mutationFn: async ({
            workspaceId,
            config = defaultConfig,
        }: {
            workspaceId: string;
            config?: JLensConfigData;
        }) => {
            return await createJLensChartPair(workspaceId, config);
        },
        onSuccess: (_, { workspaceId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.sidebar(workspaceId) });
        },
    });
};

export const useCreatePatchLensChartPair = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ workspaceId }: { workspaceId: string }) => {
            return await createPatchLensChartPair(workspaceId);
        },
        onSuccess: (_, { workspaceId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.sidebar(workspaceId) });
        },
    });
};

// TODO(cadentj): FIX THIS
export const useCreatePatchChartPair = () => {
    const queryClient = useQueryClient();

    const defaultConfig = {
        edits: [],
        model: "",
        source: "",
        destination: "",
        submodule: "attn",
        correctId: 0,
        incorrectId: undefined,
        patchTokens: false,
    } as PatchingConfig;

    return useMutation({
        mutationFn: async ({
            workspaceId,
            config = defaultConfig,
        }: {
            workspaceId: string;
            config?: PatchingConfig;
        }) => {
            return await createPatchChartPair(workspaceId, config);
        },
        onSuccess: ({ chart }) => {
            queryClient.invalidateQueries({ queryKey: ["patchCharts"] });
            queryClient.invalidateQueries({
                queryKey: queryKeys.charts.sidebar(chart.workspaceId),
            });
        },
    });
};

export const useCopyChart = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (chartId: string) => copyChart(chartId),
        onSuccess: (newChart) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.charts.sidebar(newChart.workspaceId),
            });
        },
    });
};

export const useCreateActivationPatchingChartPair = () => {
    const queryClient = useQueryClient();

    const defaultConfig = DEFAULT_ACTIVATION_PATCHING_CONFIG;

    return useMutation({
        mutationFn: async ({
            workspaceId,
            config = defaultConfig,
        }: {
            workspaceId: string;
            config?: ActivationPatchingConfigData;
        }) => {
            return await createActivationPatchingChartPair(workspaceId, config);
        },
        onSuccess: (_, { workspaceId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.sidebar(workspaceId) });
        },
    });
};

/** Tools a data-less chart can be converted into in place (the sidebar tools). */
export type ConvertibleTool = "lens2" | "jlens" | "activation-patching" | "patch-lens";

/**
 * Converts an empty (data-less) chart into a different tool in place, reusing
 * its row instead of creating a second blank chart. Starts from the same fresh
 * default config the create hooks use for that tool.
 */
export const useConvertChartType = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            chartId,
            toolType,
        }: {
            chartId: string;
            toolType: ConvertibleTool;
        }) => {
            switch (toolType) {
                case "lens2":
                    return await convertLens2ChartInPlace(chartId, DEFAULT_LENS2_CONFIG);
                case "jlens":
                    return await convertJLensChartInPlace(chartId, DEFAULT_JLENS_CONFIG);
                case "activation-patching":
                    return await convertActivationPatchingChartInPlace(
                        chartId,
                        DEFAULT_ACTIVATION_PATCHING_CONFIG,
                    );
                case "patch-lens":
                    return await convertPatchLensChartInPlace(chartId);
                default:
                    // Fail fast if ConvertibleTool grows a member this switch
                    // doesn't handle, rather than returning undefined and having
                    // onSuccess throw on `{ chart }`.
                    throw new Error(`Unsupported convert target: ${toolType as string}`);
            }
        },
        onSuccess: ({ chart }, { chartId }) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.charts.sidebar(chart.workspaceId),
            });
            // Remove (not just invalidate) the chart + config caches so the
            // destination tool's Area mounts with no data and shows its own
            // loading skeleton until the fresh, correctly-typed config arrives.
            // Invalidating would serve the previous tool's cached config for a
            // frame — harmless for lens2↔jlens (same shape) but a mismatch for
            // activation-patching. Removing avoids that flash entirely.
            queryClient.removeQueries({ queryKey: queryKeys.charts.chart(chartId) });
            queryClient.removeQueries({ queryKey: queryKeys.charts.configByChart(chartId) });
        },
    });
};
