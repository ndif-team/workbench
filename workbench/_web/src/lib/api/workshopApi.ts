import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
    getWorkshopForWorkspace,
    listWorkshops,
    createWorkshop,
    updateWorkshop,
    deleteWorkshop,
} from "@/lib/queries/workshopQueries";
import { getWorkshopAnalytics } from "@/lib/queries/workshopAnalyticsQueries";
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

/** Per-workshop analytics for the /admin/workshops/[id] dashboard. */
export const useWorkshopAnalytics = (workshopId: string | undefined) =>
    useQuery({
        queryKey: queryKeys.workshops.analytics(workshopId ?? ""),
        queryFn: () => getWorkshopAnalytics(workshopId as string),
        enabled: !!workshopId,
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
        onSuccess: (_data, { id }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.workshops.all });
            // An edit can reassign the tutorial or change gating, both of which
            // alter the analytics dashboard's step order / funnel.
            queryClient.invalidateQueries({ queryKey: queryKeys.workshops.analytics(id) });
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
