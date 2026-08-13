import config from "./config";
import { useWorkspace } from "@/stores/useWorkspace";
import { NDIFJobError, parseJobError } from "./ndifError";

const POLL_TIMEOUT_MS = 300000;
const POLL_INTERVAL_MS = 1000;

/** One NDIF job dispatched during a run. */
export interface JobRecord {
    jobId: string;
    /**
     * Milliseconds the job was reported as QUEUED: from the first poll showing
     * QUEUED to the first poll showing anything else. 0 when it was never seen
     * queued. Null while in flight and if the job failed.
     *
     * Bounded by POLL_INTERVAL_MS — a queue shorter than one poll can be missed
     * entirely, and the measured edges are up to a poll late.
     */
    queueWaitMs: number | null;
    /** Milliseconds from dispatch to COMPLETED. `totalMs - queueWaitMs` is time
     * not spent queued, which is the closest we get to execution time from
     * outside. Null while in flight and if the job failed. */
    totalMs: number | null;
}

interface JobTiming {
    queueWaitMs: number;
    totalMs: number;
}

/**
 * Collector a caller can hand down to capture the jobs a run dispatched.
 *
 * The job id is created here, several layers below whoever wants to report it,
 * and only the result travels back up. Rather than change the return type of
 * every wrapper, callers that care pass a sink; everyone else omits it. It's
 * an array because a run can dispatch more than one job — patch-lens issues a
 * source and a target lens in parallel.
 */
export type JobSink = JobRecord[];

/** Resolves with how the job's time was spent. */
async function awaitNDIFJob(jobId: string): Promise<JobTiming> {
    const startedAt = Date.now();
    const { setJobStatus } = useWorkspace.getState();
    // The QUEUED window: opened by the first poll reporting QUEUED, closed by
    // the first poll reporting anything else — including COMPLETED, when the
    // job goes straight from the queue to done without an observable
    // intermediate status.
    let queuedAt: number | null = null;
    let queueEndedAt: number | null = null;

    while (true) {
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
            setJobStatus("timeout");
            throw new Error(
                `Timed out after ${Math.round(POLL_TIMEOUT_MS / 1000)}s waiting for job ${jobId}`,
            );
        }

        const pollResp = await fetch(config.ndifStatusUrl(jobId));
        if (!pollResp.ok) {
            throw new Error(`Polling job ${jobId} failed (HTTP ${pollResp.status})`);
        }
        const data = await pollResp.json();
        const status = data?.status as string | undefined;

        // Track the queue window before acting on the status, so a transition
        // straight to COMPLETED still closes it.
        const now = Date.now();
        if (status === "QUEUED") {
            queuedAt ??= now;
        } else if (queuedAt !== null && queueEndedAt === null) {
            queueEndedAt = now;
        }

        if (status === "COMPLETED") {
            setJobStatus("Idle");
            return {
                queueWaitMs: queuedAt === null ? 0 : (queueEndedAt ?? now) - queuedAt,
                totalMs: now - startedAt,
            };
        }

        // ERROR is the only failure status NDIF reports.
        if (status === "ERROR") {
            setJobStatus("Error");
            const parsed = parseJobError(data?.description);

            console.error(
                `[NDIF ${status}] job ${jobId} — ${parsed.name ?? "unrecognized error"}: ${parsed.message}`,
            );
            if (parsed.traceback) console.error(parsed.traceback);
            // Nothing parseable: dump the payload so the cause isn't lost.
            else console.error("Raw NDIF response:", data);

            throw new NDIFJobError(parsed, jobId, status);
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
    if (!response.ok) {
        throw new Error(`Failed to start job (HTTP ${response.status} from ${url})`);
    }
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
    if (!resp.ok) {
        throw new Error(`Failed to fetch results (HTTP ${resp.status} from ${url})`);
    }
    return resp.json() as Promise<T>;
}

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
        // Recorded before the wait so a job that fails still shows up in the
        // sink; `queueWaitMs` is filled in on the way out.
        const record: JobRecord = { jobId, queueWaitMs: null, totalMs: null };
        jobs?.push(record);
        const timing = await awaitNDIFJob(jobId);
        record.queueWaitMs = timing.queueWaitMs;
        record.totalMs = timing.totalMs;

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
