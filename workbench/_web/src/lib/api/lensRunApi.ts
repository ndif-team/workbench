/**
 * F1 prompt-history client hooks. Thin React Query wrappers over the
 * lensRunQueries server actions. History is server-truth (per CLAUDE.md §6);
 * the cm-intro run mutation appends a row on success and invalidates these.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    clearLensRunsForChart,
    getLensRunsByChart,
} from "@/lib/queries/lensRunQueries";
import { queryKeys } from "@/lib/queryKeys";
import type { LensRun } from "@/db/schema";

export const useLensRuns = (chartId: string | undefined, model: string | undefined) =>
    useQuery<LensRun[]>({
        queryKey: queryKeys.lensRuns.byChart(chartId ?? "", model),
        queryFn: () => getLensRunsByChart(chartId as string, model),
        enabled: !!chartId,
    });

export const useClearLensRuns = (chartId: string | undefined) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            if (!chartId) return;
            await clearLensRunsForChart(chartId);
        },
        onSuccess: () => {
            if (!chartId) return;
            queryClient.invalidateQueries({ queryKey: ["lensRuns", chartId] });
        },
    });
};
