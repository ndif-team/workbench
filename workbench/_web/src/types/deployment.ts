/**
 * Cold-model deployment ("warmup") types. A COLD model isn't loaded on NDIF;
 * submitting a lightweight throwaway generation request causes NDIF to deploy
 * it, moving it toward HOT. This is deliberately separate from normal
 * generation/tool execution — the warmup prompt is never stored as user
 * generation history or treated as a chart result.
 */

export type DeploymentPhase =
    | "idle" // not started
    | "submitting" // sending the warmup request to the backend
    | "deploying" // NDIF is queuing/loading the model (job not yet RUNNING)
    | "ready" // model reached RUNNING / HOT — runnable
    | "error"; // warmup failed (backend/provider error)

export interface DeploymentState {
    model: string;
    phase: DeploymentPhase;
    /** NDIF job id of the in-flight warmup request, once started. */
    jobId?: string;
    /** Human-readable error when phase === "error". */
    error?: string;
}
