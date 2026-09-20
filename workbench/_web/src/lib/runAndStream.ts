import config from "./config";
import { useWorkspace } from "@/stores/useWorkspace";

/**
 * One POST that stays open for the life of a job.
 *
 * Replaces the three-legged flow this used to take — POST /start for a job id,
 * poll NDIF's /response/{id} from the browser until COMPLETED, POST /results/{id}
 * — with a single request whose response is a stream of Server-Sent Events. The
 * backend forwards each NDIF status as it lands and then the finished payload.
 *
 * The browser no longer talks to NDIF at all, which is why there is no NDIF URL
 * in `config` any more: the only origin this app calls is its own backend.
 *
 * The tradeoff is that a run now lives and dies with its connection. Polling a
 * job id survived a reload; this does not. Runs are seconds to a couple of
 * minutes, and the result is written to the workspace by the caller's mutation
 * either way, so what is lost is the ability to *rejoin* a run in progress.
 */

type SSEEvent = { event: string; data: string };

/** Parse a fetch body into SSE events: blank-line-separated `event:`/`data:` blocks. */
async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<SSEEvent> {
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
                const frame = buffer.slice(0, separator);
                buffer = buffer.slice(separator + 2);

                let eventName = "message";
                const dataLines: string[] = [];
                for (const line of frame.split("\n")) {
                    if (line.startsWith("event:")) {
                        eventName = line.slice(6).trim();
                    } else if (line.startsWith("data:")) {
                        // One leading space after the colon is part of the
                        // framing, not the payload.
                        dataLines.push(line.slice(5).replace(/^ /, ""));
                    }
                }
                if (dataLines.length === 0) continue;
                yield { event: eventName, data: dataLines.join("\n") };
            }
        }
    } finally {
        reader.releaseLock();
    }
}

/** The message from a failed response, preferring FastAPI's `detail`. */
async function failureMessage(response: Response): Promise<string> {
    try {
        const body = await response.json();
        if (typeof body?.detail === "string") return body.detail;
    } catch {
        /* not JSON; fall through to the status line */
    }
    return `Request failed: ${response.status} ${response.statusText}`;
}

/**
 * POST to a streaming endpoint and resolve with its final payload.
 *
 * Pushes every status the backend reports into `useWorkspace.jobStatus`, so the
 * header pill tracks the job. Throws on an `error` frame, on a failure before
 * the stream opened (a 403 for a model the user can't reach), or if the stream
 * ends without delivering data.
 */
export async function runAndStream<T>(
    endpoint: string,
    body: unknown,
    headers?: Record<string, string>,
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

    let data: T | null = null;
    let failure: string | null = null;

    for await (const frame of parseSSE(response.body)) {
        if (frame.event === "status") {
            try {
                const status = JSON.parse(frame.data);
                // QUEUED carries its position in the description, which the pill
                // renders — mirroring what the old poll loop displayed.
                if (status?.status === "QUEUED") {
                    const position = status?.description?.match(/\d+/)?.[0];
                    setJobStatus(position ? `QUEUED: ${position}` : "QUEUED");
                } else if (status?.status) {
                    setJobStatus(status.status);
                }
            } catch {
                /* a malformed status frame is not worth failing the run over */
            }
        } else if (frame.event === "data") {
            data = JSON.parse(frame.data) as T;
            setJobStatus("Idle");
        } else if (frame.event === "error") {
            try {
                failure = (JSON.parse(frame.data) as { error?: string }).error ?? frame.data;
            } catch {
                failure = frame.data;
            }
        }
    }

    if (failure !== null) {
        setJobStatus("Error");
        throw new Error(failure);
    }
    if (data === null) {
        // The connection closed early — a dropped stream, or a proxy that cut it.
        setJobStatus("Error");
        throw new Error("The run ended before returning a result");
    }
    return data;
}
