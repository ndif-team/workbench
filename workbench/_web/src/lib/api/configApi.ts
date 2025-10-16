import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteConfig, setConfig } from "@/lib/queries/configQueries";
import { NewConfig } from "@/db/schema";
import { toast } from "sonner";
import { queryKeys } from "../queryKeys";

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
      toast.error("Error deleting config");
    },
  });
};

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
