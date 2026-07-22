import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
    resolveTutorialForWorkspace,
    listTutorials,
    createTutorial,
    updateTutorial,
    deleteTutorial,
    ensureSeedTutorial,
} from "@/lib/queries/tutorialContentQueries";
import type { TutorialInput } from "@/lib/queries/tutorialContentDb";
import type { TutorialContent } from "@/types/tutorial-content";
import { queryKeys } from "../queryKeys";

/**
 * The guided-tutorial content a workspace runs (its workshop's assigned tutorial,
 * else the seeded demo). Read by the patch-lens tutorial panel. Content is
 * effectively immutable per session, so cache it hard.
 */
export const useWorkspaceTutorial = (workspaceId: string | undefined) =>
    useQuery({
        queryKey: queryKeys.tutorials.byWorkspace(workspaceId ?? ""),
        queryFn: () => resolveTutorialForWorkspace(workspaceId as string),
        enabled: !!workspaceId,
        staleTime: Infinity,
    });

// ---- Admin hooks (server actions re-check the ADMIN_EMAILS allowlist) ----

export const useTutorials = () =>
    useQuery({
        queryKey: queryKeys.tutorials.all,
        queryFn: () => listTutorials(),
    });

export const useCreateTutorial = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: Omit<TutorialInput, "createdBy">) => createTutorial(input),
        onError: () => toast.error("Failed to create tutorial"),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.tutorials.all }),
    });
};

export const useUpdateTutorial = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({
            id,
            updates,
        }: {
            id: string;
            updates: { name?: string; data?: TutorialContent };
        }) => updateTutorial(id, updates),
        onError: () => toast.error("Failed to update tutorial"),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.tutorials.all });
            // Editing a tutorial's units changes the step order/labels of every
            // workshop that runs it; refresh all analytics dashboards.
            queryClient.invalidateQueries({ queryKey: queryKeys.workshops.analyticsAll });
        },
    });
};

export const useDeleteTutorial = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => deleteTutorial(id),
        onError: () => toast.error("Failed to delete tutorial"),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.tutorials.all });
            // deleteTutorial nulls workshops.tutorialId; refetch workshops so a
            // stale edit dialog doesn't re-submit the deleted id (FK violation).
            queryClient.invalidateQueries({ queryKey: queryKeys.workshops.all });
            // Affected workshops fall back to the demo tutorial's step order —
            // refresh their analytics dashboards.
            queryClient.invalidateQueries({ queryKey: queryKeys.workshops.analyticsAll });
        },
    });
};

export const useEnsureSeedTutorial = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => ensureSeedTutorial(),
        onError: () => toast.error("Failed to seed demo tutorial"),
        onSuccess: () => {
            toast.success("Demo tutorial ready");
            queryClient.invalidateQueries({ queryKey: queryKeys.tutorials.all });
        },
    });
};
