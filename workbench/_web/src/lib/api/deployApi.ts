import config from "@/lib/config";
import { createUserHeadersAction } from "@/actions/auth";
import { runAndStream } from "@/lib/runAndStream";

/**
 * Cold-model deployment ("warmup") API — isolated from normal generation/tool
 * execution. It reuses the generation endpoint with a tiny throwaway prompt
 * purely to make NDIF deploy the model; the response is never surfaced as a
 * generation result or stored as history.
 *
 * "Deployed" means the warmup generation actually returned — i.e. the model ran
 * a forward pass end to end, which proves it is loaded and serving. NDIF's
 * RUNNING is a weaker signal: it can be reported at dispatch time, before the
 * replica has finished loading its weights.
 *
 * This used to POST for a job id and then poll NDIF from the browser on a
 * 20-minute ceiling. It is now one streamed request like every other, so the
 * connection *is* the wait. Two things that costs: a reload abandons the wait
 * (though not the deployment, which NDIF carries on with), and a cold load can
 * go minutes without a status update, which is longer than some proxies leave
 * an idle connection alone.
 */

export class DeploymentError extends Error {}

/** Warm a model up, resolving once it has provably run. */
export async function deployModel(model: string): Promise<void> {
    const headers = await createUserHeadersAction();

    try {
        await runAndStream<unknown>(
            config.endpoints.runGenerate,
            { model, prompt: "Hello", max_new_tokens: 1 },
            headers,
        );
    } catch (error) {
        throw new DeploymentError(
            error instanceof Error ? error.message : "Deployment failed",
        );
    }
}
