import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "@/stores/useWorkspace";
import { useModelsQuery } from "@/lib/api/modelsApi";

/**
 * Tracks the chart's locally-committed model selection.
 *
 * The "draft" model is the user's current intent for this chart — set by
 * Reset, by Sync, or by an implicit prompt-edit commit. Mutations to it
 * never write to the DB; persistence happens only when the user clicks Run.
 *
 * On chart change, the draft re-syncs from the freshly loaded saved model.
 *
 * The hook also exposes `restoreWorkspaceModel(model)` — used by Reset to
 * snap the header pill (workspace `selectedModelIdx`) back to the saved
 * model, so the mismatch banner state doesn't re-derive from a stale
 * workspace selection.
 */
export function useDraftModel(savedModel: string, configId: string | undefined) {
    const { setSelectedModelIdx } = useWorkspace();
    const { data: workspaceModels } = useModelsQuery();

    const [draftModel, setDraftModel] = useState(savedModel);

    useEffect(() => {
        setDraftModel(savedModel);
    }, [configId, savedModel]);

    const restoreWorkspaceModel = useCallback(
        (model: string) => {
            if (!workspaceModels || !model) return;
            const idx = workspaceModels.findIndex((m) => m.name === model);
            if (idx !== -1) setSelectedModelIdx(idx);
        },
        [workspaceModels, setSelectedModelIdx],
    );

    return { draftModel, setDraftModel, restoreWorkspaceModel };
}
