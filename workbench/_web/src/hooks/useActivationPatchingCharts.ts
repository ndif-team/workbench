import { useParams } from "next/navigation";
import { ActivationPatchingConfigData } from "@/types/activationPatching";
import { useActivationPatchingLine } from "@/lib/api/chartApi";
import { useUpdateChartConfig } from "@/lib/api/configApi";
import { useLensWorkspace } from "@/stores/useLensWorkspace";

export const useActivationPatchingCharts = ({ configId }: { configId: string }) => {
    const { workspaceId, chartId } = useParams<{ workspaceId: string; chartId: string }>();
    const { mutateAsync: updateChartConfig, isPending: isUpdatingChartConfig } =
        useUpdateChartConfig();
    const { mutateAsync: createLineChart, isPending: isCreatingLineChart } = useActivationPatchingLine();
    const { clearHighlightedLineIds } = useLensWorkspace();

    const handleCreateLineChart = async (config: ActivationPatchingConfigData) => {
        console.log("handleCreateLineChart called with config:", {
            // srcPrompt: config.srcPrompt?.substring(0, 50),
            // tgtPrompt: config.tgtPrompt?.substring(0, 50),
            srcPrompt: config.srcPrompt,
            tgtPrompt: config.tgtPrompt,
            srcPosition: config.srcPosition,
            tgtPosition: config.tgtPosition,
            targetIds: config.targetIds,
            srcTokens: config.srcTokens?.length,
            tgtTokens: config.tgtTokens?.length,
            metric: config.metric,
            model: config.model,
        });

        if (!config.targetIds || config.targetIds.length === 0) {
            console.error("Cannot create line chart: targetIds is empty or undefined");
            throw new Error("No target IDs selected");
        }

        // Save config BEFORE running to ensure it's persisted
        console.log("Saving config to database...");
        await updateChartConfig({
            configId: configId,
            config: {
                data: config,
                workspaceId: workspaceId as string,
                type: "activation-patching",
            },
        });
        console.log("Config saved successfully");

        // Then run the chart
        const data = await createLineChart({
            patchingRequest: {
                completion: config,
                chartId: chartId,
            },
            configId: configId,
        });

        clearHighlightedLineIds();

        return data;
    };

    const isExecuting = isCreatingLineChart || isUpdatingChartConfig;

    return {
        isExecuting,
        isCreatingLineChart,
        handleCreateLineChart,
    };
};

