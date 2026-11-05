import config from "./config";
import { useWorkspace } from "@/stores/useWorkspace";
import { NDIFJobError, parseJobError } from "./ndifError";
import { NDIFJob, type JobSink } from "./ndifJob";

const POLL_TIMEOUT_MS = 300000;
const POLL_INTERVAL_MS = 1000;

/**
 * Polls an NDIF job until it completes, mirroring its status into the status
 * pill and its queue window into `job`. A failure status throws an
 * `NDIFJobError` parsed from the job's traceback. The queue window can be up
 * to a poll late at each edge, and a queue shorter than a poll can be missed.
 */
async function awaitNDIFJob(jobId: string, job: NDIFJob): Promise<void> {
    const startedAt = Date.now();
    const { setJobStatus } = useWorkspace.getState();
    while (true) {
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
            setJobStatus("timeout");
            throw new Error(
                `Timed out after ${Math.round(POLL_TIMEOUT_MS / 1000)}s waiting for job ${jobId}`,
            );
        }

        const pollResp = await fetch(config.ndifStatusUrl(jobId));
        if (!pollResp.ok) throw new Error(`Polling job ${jobId} failed (HTTP ${pollResp.status})`);
        const data = await pollResp.json();
        const status = data?.status as string | undefined;
        job.observe(status);

        if (status === "COMPLETED") {
            job.complete();
            setJobStatus("Idle");
            return;
        }

        if (NDIFJob.isFailure(status)) {
            setJobStatus("Error");
            const error = new NDIFJobError(parseJobError(data?.description), jobId, status);
            error.log(data);
            throw error;
        }

        if (status === "QUEUED") {
            const match = data?.description?.match(/\d+/);
            const num = match ? parseInt(match[0], 10) : null;
            setJobStatus(num !== null ? `${status}: ${num}` : status);
        } else if (status) {
            setJobStatus(status);
        }

        // For non-terminal statuses, wait and try again
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
}

type JobStartResponse<T> = { job_id: string | null } & { data?: T } & Record<string, unknown>;

async function startJob<T>(
    url: string,
    body: unknown,
    headers?: Record<string, string>,
): Promise<JobStartResponse<T>> {
    const response = await fetch(url, {
        method: "POST",
        // See modelsApi.ts: send oauth2-proxy cookies cross-origin.
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Failed to start job (HTTP ${response.status} from ${url})`);
    return await response.json();
}

async function fetchResults<T>(
    url: string,
    body: unknown,
    headers?: Record<string, string>,
): Promise<T> {
    const resp = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
        body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`Failed to fetch results (HTTP ${resp.status} from ${url})`);
    return resp.json() as Promise<T>;
}

/**
 * Starts an NDIF job, polls it to completion and fetches its results. The job
 * is recorded in `jobs` before the wait, so one that fails still reaches the
 * run's telemetry, and its queue and total times are filled in on completion.
 */
export async function startAndPoll<T>(
    startEndpoint: string,
    body: unknown,
    resultsEndpoint: (jobId: string) => string,
    headers?: Record<string, string>,
    jobs?: JobSink,
): Promise<T> {
    const startUrl = config.getApiUrl(startEndpoint);
    const response = await startJob<T>(startUrl, body, headers);
    const jobId = response?.job_id ?? null;
    if (jobId) {
        await awaitNDIFJob(jobId, new NDIFJob(jobId, jobs));

        const resultsUrl = config.getApiUrl(resultsEndpoint(jobId));
        const results = await fetchResults<unknown>(resultsUrl, body, headers);
        if (results && typeof results === "object" && "data" in results) {
            return (results as { data: T }).data;
        }
        return results as T;
    }
    if ("data" in response) {
        return (response as { data: T | null }).data as T;
    }
    return response as unknown as T;
}
