import config from "@/lib/config";
import { createUserHeadersAction } from "@/actions/auth";

/**
 * Cold-model deployment ("warmup") API — isolated from normal generation/tool
 * execution. It reuses the `/models/start-generate` endpoint with a tiny
 * throwaway prompt purely to make NDIF deploy the model; the response is never
 * surfaced as a generation result or stored as history.
 *
 * "Deployed" is signalled when the NDIF job reaches COMPLETED — i.e. the tiny
 * warmup generation actually ran end-to-end, which proves the model is loaded
 * and serving. (RUNNING is a weaker signal: NDIF can report it at dispatch
 * time, before the replica finishes loading the weights, so we don't treat it
 * as deployed.) Unlike normal tool requests (`startAndPoll`, 60s hard
 * timeout), cold deploys can take minutes, so the poll uses a generous ceiling
 * and never fails early on slowness alone.
 */

// Generous safety ceiling — cold deploys are slow, but we don't want a truly
// stuck job to poll forever. ~20 minutes.
const DEPLOY_POLL_TIMEOUT_MS = 20 * 60 * 1000;
const DEPLOY_POLL_INTERVAL_MS = 2000;

export class DeploymentError extends Error {}

/** Fire the warmup request. Returns the NDIF job id (remote) or null (local,
 * where the model is effectively already available). */
export async function submitWarmup(model: string): Promise<string | null> {
    const headers = await createUserHeadersAction();
    const resp = await fetch(config.getApiUrl(config.endpoints.startGenerate), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ model, prompt: "Hello", max_new_tokens: 1 }),
    });
    if (!resp.ok) {
        throw new DeploymentError(`Failed to start deployment (HTTP ${resp.status})`);
    }
    const data = (await resp.json()) as { job_id?: string | null };
    return data.job_id ?? null;
}

/**
 * Poll the NDIF job until the warmup generation has COMPLETED — the point at
 * which the model has provably executed a request and is therefore loaded and
 * hot. Rejects on NDIF error statuses or the safety-ceiling timeout.
 * `onStatus` reports the raw NDIF status for UI.
 */
export async function pollUntilDeployed(
    jobId: string,
    onStatus?: (status: string) => void,
    signal?: AbortSignal,
): Promise<void> {
    const startedAt = Date.now();
    while (true) {
        if (signal?.aborted) throw new DeploymentError("Deployment cancelled");
        if (Date.now() - startedAt > DEPLOY_POLL_TIMEOUT_MS) {
            throw new DeploymentError("Deployment timed out");
        }

        let resp: Response;
        try {
            resp = await fetch(config.ndifStatusUrl(jobId), { signal });
        } catch {
            // fetch rejects (vs. returning non-ok) on network failure — DNS,
            // refused connection, etc. Surface it as a status-check problem
            // rather than the generic "Deployment failed".
            throw new DeploymentError("Couldn't reach NDIF to check deployment status");
        }
        if (!resp.ok) throw new DeploymentError("Deployment status check failed");
        const data = (await resp.json()) as { status?: string; description?: string };
        const status = data.status;
        if (status) onStatus?.(status);

        // Only COMPLETED proves the model actually ran the warmup forward pass.
        // RUNNING is intentionally NOT treated as deployed: NDIF can report it
        // while the replica is still loading weights, which would flip the UI
        // to "ready" before the model is genuinely servable.
        if (status === "COMPLETED") return;

        if (status === "ERROR" || status === "NNSIGHT_ERROR") {
            throw new DeploymentError("Deployment failed on the backend");
        }

        await new Promise((r) => setTimeout(r, DEPLOY_POLL_INTERVAL_MS));
    }
}
