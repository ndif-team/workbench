/**
 * F1 prompt-history client hooks. Thin React Query wrappers over the
 * lensRunQueries server actions. History is server-truth (per CLAUDE.md §6);
 * the cm-intro run mutation appends a row on success and invalidates these.
 *
 * The list (`useLensRuns`) returns the compact `LensRunListItem` (no heatmaps);
 * full heatmaps are fetched on demand by id via `useLensRunHeatmaps`.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    clearLensRunsForChart,
    getLensRunsByChart,
    getLensRunHeatmapsByIds,
    type LensRunListItem,
} from "@/lib/queries/lensRunQueries";
import { queryKeys } from "@/lib/queryKeys";

export const useLensRuns = (
    workspaceId: string | undefined,
    chartId: string | undefined,
    model?: string,
) =>
    useQuery<LensRunListItem[]>({
        queryKey: queryKeys.lensRuns.byChart(chartId ?? "", model),
        queryFn: () => getLensRunsByChart(workspaceId as string, chartId as string, model),
        enabled: !!chartId && !!workspaceId,
    });

/**
 * Full heatmaps for a set of runs (restore / compare overlay). Sorted ids give
 * a stable cache key regardless of selection order, so the two prompts a
 * compare diffs hit the same cache entry however they were picked.
 */
export const useLensRunHeatmaps = (ids: string[]) => {
    const sorted = [...ids].sort();
    return useQuery({
        queryKey: queryKeys.lensRuns.heatmaps(sorted),
        queryFn: () => getLensRunHeatmapsByIds(sorted),
        enabled: sorted.length > 0,
    });
};

export const useClearLensRuns = (workspaceId: string | undefined, chartId: string | undefined) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            if (!chartId || !workspaceId) return;
            await clearLensRunsForChart(workspaceId, chartId);
        },
        onSuccess: () => {
            if (!chartId) return;
            queryClient.invalidateQueries({ queryKey: queryKeys.lensRuns.byChart(chartId) });
        },
    });
};
