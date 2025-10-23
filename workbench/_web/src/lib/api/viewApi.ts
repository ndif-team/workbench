import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createView, deleteView, updateView } from "@/lib/queries/viewQueries";
import { NewView } from "@/db/schema";
import type { ChartView } from "@/types/charts";
import { toast } from "sonner";
import { queryKeys } from "../queryKeys";

export const useCreateView = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (newView: NewView) => {
            const view = await createView(newView);
            return view;
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.views.byChart(variables.chartId) });
        },
        onError: (error) => {
            toast.error("Error creating view");
        },
    });
};

export const useDeleteView = () => {
    const queryClient = useQueryClient();

    return useMutation({
        // Pass chartId to invalidate the correct query
        mutationFn: async ({ id, chartId }: { id: string; chartId: string }) => {
            await deleteView(id);
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.views.byChart(variables.chartId) });
        },
        onError: (error) => {
            toast.error("Error deleting view");
        },
    });
};

export const useUpdateView = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            id,
            chartId,
            data,
        }: {
            id: string;
            chartId: string;
            data: ChartView;
        }) => {
            const view = await updateView(id, data);
            return view;
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.views.byChart(variables.chartId) });
        },
        onError: (error) => {
            toast.error("Error updating view");
        },
    });
};
