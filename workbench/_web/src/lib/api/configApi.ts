import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setConfig } from "@/lib/queries/configQueries";
import { NewConfig } from "@/db/schema";
import { toast } from "sonner";
import { queryKeys } from "../queryKeys";

export const useUpdateChartConfig = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            configId,
            config,
        }: {
            configId: string;
            chartId?: string;
            config: NewConfig;
        }) => {
            await setConfig(configId, config);
        },
        onSuccess: (data, variables: { configId: string; chartId?: string; config: NewConfig }) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.charts.config(variables.configId),
            });
            if (variables.chartId) {
                queryClient.invalidateQueries({
                    queryKey: queryKeys.charts.configByChart(variables.chartId),
                });
            }
            // toast.success("Config updated");
        },
        onError: (error) => {
            toast.error("Error updating config");
        },
    });
};
