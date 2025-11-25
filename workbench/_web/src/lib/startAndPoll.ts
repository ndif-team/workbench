import config from "./config";
import { useWorkspace } from "@/stores/useWorkspace";

const POLL_TIMEOUT_MS = 15000;
const POLL_INTERVAL_MS = 1000;

async function awaitNDIFJob(jobId: string): Promise<void> {
    const startedAt = Date.now();
    const { setJobStatus } = useWorkspace.getState();
    while (true) {
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
            setJobStatus("timeout");
            console.error("Timed out waiting for job to complete");
            throw new Error("Timed out waiting for job to complete");
        }

        const pollResp = await fetch(config.ndifStatusUrl(jobId));
        if (!pollResp.ok) throw new Error("Polling failed");
        const data = await pollResp.json();
        const status = data?.status as string | undefined;

        if (status === "COMPLETED") {
            setJobStatus("Idle");
            return;
        }
        if (status === "ERROR" || status === "NNSIGHT_ERROR") {
            setJobStatus("Error");
            console.log("Error: ", data)
            console.log(data["description"])
            throw new Error("Job failed");
        }

        if (status) {
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
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("Failed to start job");
    return await response.json();
}

async function fetchResults<T>(
    url: string,
    body: unknown,
    headers?: Record<string, string>,
): Promise<T> {
    const resp = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
        body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error("Failed to fetch results");
    return resp.json() as Promise<T>;
}

export async function startAndPoll<T>(
    startEndpoint: string,
    body: unknown,
    resultsEndpoint: (jobId: string) => string,
    headers?: Record<string, string>,
): Promise<T> {
    const startUrl = config.getApiUrl(startEndpoint);
    const response = await startJob<T>(startUrl, body, headers);
    const jobId = response?.job_id ?? null;
    if (jobId) {
        await awaitNDIFJob(jobId);

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
