import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setConfig } from "@/lib/queries/configQueries";
import { NewConfig } from "@/db/schema";
import { toast } from "sonner";
import { queryKeys } from "../queryKeys";
import { findLibraryItem } from "./workspaceApi";
import type { WorkspaceLibrary } from "@/types/workspaces";

/**
 * Whether a config save changes what the sidebar library shows for its chart
 * (the prompt it is labelled by, the model). UI-state saves (a widget's view)
 * change neither, so they don't refetch the library.
 */
const labelChanged = (
    library: WorkspaceLibrary | undefined,
    { chartId, config }: { chartId?: string; config: NewConfig },
): boolean => {
    const item = library && chartId ? findLibraryItem(library, "chart", chartId) : undefined;
    if (item?.kind !== "chart") return true;
    const data = config.data as { model?: string; prompt?: string; srcPrompt?: string };
    const prompt = (data.prompt || data.srcPrompt)?.trim() || null;
    return item.model !== (data.model || null) || item.prompt !== prompt;
};

export const useUpdateChartConfig = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: ["updateChartConfig"],
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
            if (labelChanged(queryClient.getQueryData(queryKeys.workspaces.library), variables)) {
                queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
            }
            // toast.success("Config updated");
        },
        onError: (error) => {
            toast.error("Error updating config");
        },
    });
};
