import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createView, deleteView, updateView } from "@/lib/queries/viewQueries";
import { NewView } from "@/db/schema";
import type { ChartView } from "@/types/charts";
import { queryKeys } from "@/lib/queryKeys";

export const useCreateView = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (newView: NewView) => {
            const view = await createView(newView);
            return view;
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.views.byChart(variables.chartId) });
            console.log("Successfully created view");
        },
        onError: (error) => {
            console.error("Error creating view:", error);
        },
    });
};

export const useDeleteView = () => {
    const queryClient = useQueryClient();

    return useMutation({
        // Pass chartId to invalidate the correct query
        mutationFn: async ({ id, chartId }: { id: string, chartId: string }) => {
            await deleteView(id);
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.views.byChart(variables.chartId) });
            console.log("Successfully deleted view");
        },
        onError: (error) => {
            console.error("Error deleting view:", error);
        },
    });
};

export const useUpdateView = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, chartId, data }: { id: string, chartId: string, data: ChartView }) => {
            const view = await updateView(id, data);
            return view;
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.views.byChart(variables.chartId) });
            console.log("Successfully updated view");
        },
        onError: (error) => {
            console.error("Error updating view:", error);
        },
    });
};