import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
    getWorkshopForWorkspace,
    listWorkshops,
    createWorkshop,
    updateWorkshop,
    deleteWorkshop,
} from "@/lib/queries/workshopQueries";
import type { WorkshopInput } from "@/lib/queries/workshopDb";
import { queryKeys } from "../queryKeys";

/**
 * The workshop a workspace was created through (null for normal workspaces).
 * Drives tool gating and model pinning inside the workspace shell.
 */
export const useWorkspaceWorkshop = (workspaceId: string | undefined) =>
    useQuery({
        queryKey: queryKeys.workshops.byWorkspace(workspaceId ?? ""),
        queryFn: () => getWorkshopForWorkspace(workspaceId as string),
        enabled: !!workspaceId,
    });

// ---- Admin hooks (server actions re-check the ADMIN_EMAILS allowlist) ----

export const useWorkshops = () =>
    useQuery({
        queryKey: queryKeys.workshops.all,
        queryFn: () => listWorkshops(),
    });

export const useCreateWorkshop = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: Omit<WorkshopInput, "createdBy">) => createWorkshop(input),
        onError: () => toast.error("Failed to create workshop"),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.workshops.all });
        },
    });
};

export const useUpdateWorkshop = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({
            id,
            updates,
        }: {
            id: string;
            updates: Partial<Omit<WorkshopInput, "createdBy">>;
        }) => updateWorkshop(id, updates),
        onError: () => toast.error("Failed to update workshop"),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.workshops.all });
        },
    });
};

export const useDeleteWorkshop = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => deleteWorkshop(id),
        onError: () => toast.error("Failed to delete workshop"),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.workshops.all });
        },
    });
};
