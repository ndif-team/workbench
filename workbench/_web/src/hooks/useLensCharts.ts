import { useParams } from "next/navigation";
import { LensConfigData } from "@/types/lens";
import { useLensGrid, useLensLine } from "@/lib/api/chartApi";
import { useUpdateChartConfig } from "@/lib/api/configApi";
import { useLensWorkspace } from "@/stores/useLensWorkspace";

export const useLensCharts = ({ configId }: { configId: string }) => {
    const { workspaceId, chartId } = useParams<{ workspaceId: string; chartId: string }>();
    const { mutateAsync: createHeatmap, isPending: isCreatingHeatmap } = useLensGrid();
    const { mutateAsync: updateChartConfig, isPending: isUpdatingChartConfig } =
        useUpdateChartConfig();
    const { mutateAsync: createLineChart, isPending: isCreatingLineChart } = useLensLine();
    const { clearHighlightedLineIds } = useLensWorkspace();

    const handleCreateHeatmap = async (config: LensConfigData) => {
        const data = await createHeatmap({
            lensRequest: {
                completion: config,
                chartId: chartId,
            },
            configId: configId,
        });

        await updateChartConfig({
            configId: configId,
            config: {
                data: config,
                workspaceId: workspaceId as string,
                type: "logit-lens",
            },
        });

        return data;
    };

    const handleCreateLineChart = async (config: LensConfigData) => {
        const data = await createLineChart({
            lensRequest: {
                completion: config,
                chartId: chartId,
            },
            configId: configId,
        });

        await updateChartConfig({
            configId: configId,
            config: {
                data: config,
                workspaceId: workspaceId as string,
                type: "logit-lens",
            },
        });

        clearHighlightedLineIds();

        return data;
    };

    const isExecuting = isCreatingHeatmap || isCreatingLineChart || isUpdatingChartConfig;

    return {
        isExecuting,
        isCreatingHeatmap,
        isCreatingLineChart,
        handleCreateHeatmap,
        handleCreateLineChart,
    };
};
