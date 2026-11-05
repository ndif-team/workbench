import config from "./config";
import { useWorkspace } from "@/stores/useWorkspace";
import { NDIFJobError, parseJobError, type ParsedJobError } from "./ndifError";
import { NDIFJob, type JobSink } from "./ndifJob";

/**
 * Runs a tool through one POST whose response is a stream of Server-Sent Events.
 *
 * The backend sends each NDIF status update as it lands (`status`), then the
 * tool's data (`data`) or a failure (`error`), so there is no job id to poll and
 * no second request for the result. A run lives as long as its connection: a
 * reload loses a run in progress, where a polled job id could be picked up again.
 */

export type SSEEvent = { event: string; data: string };

/**
 * Parse a response body into SSE events: blank-line-separated blocks of
 * `event:` and `data:` lines. Comment lines (`: keepalive`) carry no data and
 * are skipped. Stopping early (a `return` or `break` out of the loop) cancels
 * the body, which closes the connection.
 */
export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<SSEEvent> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let separator: number;
            while ((separator = buffer.indexOf("\n\n")) !== -1) {
                const block = buffer.slice(0, separator);
                buffer = buffer.slice(separator + 2);

                let event = "message";
                const data: string[] = [];
                for (const line of block.split("\n")) {
                    if (line.startsWith("event:")) event = line.slice(6).trim();
                    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
                }
                if (data.length > 0) yield { event, data: data.join("\n") };
            }
        }
    } finally {
        await reader.cancel();
    }
}

/** A `status` event: nnsight's `ResponseModel` without its data. */
type StatusUpdate = { id?: string; status?: string; description?: string };

/** The status pill's text for an NDIF status update, or null to leave it as is. */
function statusLabel(update: StatusUpdate): string | null {
    if (!update?.status || update.status === "LOG") return null;
    if (update.status === "QUEUED") {
        const position = update.description?.match(/\d+/)?.[0];
        return position ? `QUEUED: ${position}` : "QUEUED";
    }
    return update.status;
}

/** The message of a response that failed before streaming, preferring FastAPI's `detail`. */
async function failureMessage(response: Response): Promise<string> {
    try {
        const body = await response.json();
        if (typeof body?.detail === "string") return body.detail;
    } catch {
        // not JSON
    }
    return `Request failed: ${response.status} ${response.statusText}`;
}

/**
 * What one run's stream has said about its NDIF job: each job id is followed
 * from its first status (`NDIFJob`, timed into the sink), and a failure
 * status's traceback is kept for the error the run ends with.
 */
class StreamedRun {
    private readonly followed = new Map<string, NDIFJob>();
    private jobId: string | null = null;
    private failure: StatusUpdate | null = null;

    constructor(private readonly jobs?: JobSink) {}

    observe(update: StatusUpdate): void {
        if (update.id) {
            this.jobId = update.id;
            let job = this.followed.get(update.id);
            if (!job) this.followed.set(update.id, (job = new NDIFJob(update.id, this.jobs)));
            job.observe(update.status);
        }
        if (NDIFJob.isFailure(update.status)) this.failure = update;
    }

    complete(): void {
        for (const job of this.followed.values()) job.complete();
    }

    /**
     * The error an `error` event ends the run with. The traceback of the job's
     * failure status is preferred, since the event's message is the backend's
     * own exception around the job's; otherwise the event's message is parsed,
     * taking its `type` (the exception class) as the name when the message
     * isn't a traceback.
     */
    fail(data: string): NDIFJobError {
        const event = StreamedRun.parse(data);
        const fromStatus = parseJobError(this.failure?.description);
        const parsed = fromStatus.name
            ? fromStatus
            : StreamedRun.named(parseJobError(event.error ?? data), event.type);
        const error = new NDIFJobError(parsed, this.jobId, this.failure?.status ?? "ERROR");
        error.log(this.failure ?? event);
        return error;
    }

    private static parse(data: string): { error?: unknown; type?: unknown } {
        try {
            const event = JSON.parse(data);
            return event && typeof event === "object" ? event : {};
        } catch {
            return {};
        }
    }

    private static named(parsed: ParsedJobError, type: unknown): ParsedJobError {
        if (parsed.name || typeof type !== "string" || !type) return parsed;
        return { ...parsed, name: type, qualifiedName: type };
    }
}

/**
 * POST to a tool's streaming endpoint and resolve with the tool's data.
 *
 * Mirrors each status update into `useWorkspace.jobStatus` for the status pill,
 * and records the NDIF job it reports in `jobs` with its queue and total times.
 * An `error` event throws an `NDIFJobError` carrying the job's id and the
 * Python exception; a response that failed before streaming (e.g. an unknown
 * model) or a stream that closed without data throws a plain `Error`.
 */
export async function runAndStream<T>(
    endpoint: string,
    body: unknown,
    headers?: Record<string, string>,
    jobs?: JobSink,
): Promise<T> {
    const { setJobStatus } = useWorkspace.getState();

    const response = await fetch(config.getApiUrl(endpoint), {
        method: "POST",
        // See modelsApi.ts: send oauth2-proxy cookies cross-origin.
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...headers,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
        setJobStatus("Error");
        throw new Error(await failureMessage(response));
    }

    const run = new StreamedRun(jobs);
    for await (const { event, data } of parseSSE(response.body)) {
        if (event === "status") {
            const update: StatusUpdate = JSON.parse(data);
            run.observe(update);
            const label = statusLabel(update);
            if (label) setJobStatus(label);
        } else if (event === "data") {
            run.complete();
            setJobStatus("Idle");
            return JSON.parse(data) as T;
        } else if (event === "error") {
            setJobStatus("Error");
            throw run.fail(data);
        }
    }

    setJobStatus("Error");
    throw new Error("The run ended before returning a result");
}
