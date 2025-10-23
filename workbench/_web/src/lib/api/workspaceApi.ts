import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createWorkspace, deleteWorkspace } from "@/lib/queries/workspaceQueries";
import { setConfig } from "@/lib/queries/configQueries";
import { NewConfig } from "@/db/schema";

export const useCreateWorkspace = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ userId, name }: { userId: string; name: string }) => {
            // This calls the server action which handles authentication
            const newWorkspace = await createWorkspace(userId, name);
            return newWorkspace;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["workspaces"] });
            console.log("Successfully created workspace");
        },
        onError: (error) => {
            console.error("Error creating workspace:", error);
        },
    });
};

export const useDeleteWorkspace = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ userId, workspaceId }: { userId: string; workspaceId: string }) => {
            await deleteWorkspace(userId, workspaceId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["workspaces"] });
            console.log("Successfully deleted workspace");
        },
        onError: (error) => {
            console.error("Error deleting workspace:", error);
        },
    });
};

export const useUpdateChartConfig = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ configId, config }: { configId: string; config: NewConfig }) => {
            await setConfig(configId, config);
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["lensCharts"] });
            console.log("Successfully updated chart config");
        },
        onError: (error) => {
            console.error("Error updating workspace:", error);
        },
    });
};
