import type { CSSProperties } from "react";
import { create } from "zustand";
import { toast } from "sonner";

import type { DeploymentPhase, DeploymentState } from "@/types/deployment";
import { submitWarmup, pollUntilDeployed, DeploymentError } from "@/lib/api/deployApi";

/** Deploy toasts read a touch lighter than the default — a translucent popover
 * surface with a subtle blur instead of a fully opaque panel. The blur earns
 * its keep here precisely because the surface isn't opaque (text stays legible
 * over whatever's behind). `--popover` is HSL components, so the `/ alpha` form
 * is valid. */
const DEPLOY_TOAST_STYLE: CSSProperties = {
    background: "hsl(var(--popover) / 0.8)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
};

/**
 * Tracks cold-model deployment ("warmup") in-flight, keyed by model name.
 *
 * The poll loop lives here (module-global) so a deployment survives route
 * changes — the user can navigate away from the deploying chart and back
 * without losing the warmup. Terminal transitions fire a site-wide toast via
 * sonner (which works outside React).
 *
 * Treating a deployment's "ready" phase as authoritative (set when the NDIF
 * warmup job reaches COMPLETED — proving the model ran a forward pass) means
 * consumers can consider a model runnable even before — or instead of — the
 * backend's catalog cache reporting it HOT.
 * `useModelsQuery` reads this store and overrides the catalog status of a
 * "ready" model to "hot", since neither our backend nor NDIF can be forced to
 * bust their heat caches on demand.
 */

interface ModelDeploymentStore {
    deployments: Record<string, DeploymentState>;
    /** Start (or restart) warming up a model. No-op if already in-flight. */
    start: (model: string) => void;
    /** Re-attempt a failed deployment. */
    retry: (model: string) => void;
    statusOf: (model: string) => DeploymentState | undefined;
    phaseOf: (model: string) => DeploymentPhase;
}

export const useModelDeployment = create<ModelDeploymentStore>()((set, get) => {
    const setPhase = (model: string, patch: Partial<DeploymentState>) =>
        set((s) => {
            const prev: DeploymentState = s.deployments[model] ?? {
                model,
                phase: "idle",
            };
            return {
                deployments: {
                    ...s.deployments,
                    [model]: { ...prev, ...patch, model },
                },
            };
        });

    const run = async (model: string) => {
        setPhase(model, { phase: "submitting", error: undefined, jobId: undefined });
        try {
            const jobId = await submitWarmup(model);
            if (!jobId) {
                // Local backend (or non-remote): the model is effectively
                // available immediately.
                setPhase(model, { phase: "ready" });
                toast.success(`${model.split("/").pop()} is now available`, {
                    style: DEPLOY_TOAST_STYLE,
                });
                return;
            }
            setPhase(model, { phase: "deploying", jobId });
            await pollUntilDeployed(jobId);
            setPhase(model, { phase: "ready" });
            toast.success(`${model.split("/").pop()} is now available`, {
                description: "The model is deployed and ready to run.",
                style: DEPLOY_TOAST_STYLE,
            });
        } catch (e) {
            const message =
                e instanceof DeploymentError ? e.message : "Deployment failed";
            setPhase(model, { phase: "error", error: message });
            toast.error(`Couldn't deploy ${model.split("/").pop()}`, {
                description: message,
                style: DEPLOY_TOAST_STYLE,
            });
        }
    };

    return {
        deployments: {},
        start: (model) => {
            const current = get().deployments[model]?.phase;
            // Already in-flight or already done — don't kick off a redundant
            // warmup. `retry` is the way back in after a failure.
            if (
                current === "submitting" ||
                current === "deploying" ||
                current === "ready"
            ) {
                return;
            }
            void run(model);
        },
        retry: (model) => void run(model),
        statusOf: (model) => get().deployments[model],
        phaseOf: (model) => get().deployments[model]?.phase ?? "idle",
    };
});
