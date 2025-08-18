import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteConfig, setConfig } from "@/lib/queries/configQueries";
import { NewConfig } from "@/db/schema";
import { queryKeys } from "@/lib/queryKeys";

export const useDeleteChartConfig = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ configId }: { configId: string }) => {
            await deleteConfig(configId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.all });
        },
        onError: (error) => {
            console.error("Error deleting completion:", error);
        },
    });
};

export const useUpdateChartConfig = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ configId, config }: { configId: string; config: NewConfig }) => {
            await setConfig(configId, config);
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.configs(variables.config.workspaceId, variables.config.chartId) });
            console.log("Successfully updated chart config");
        },
        onError: (error) => {
            console.error("Error updating workspace:", error);
        },
    });
};
