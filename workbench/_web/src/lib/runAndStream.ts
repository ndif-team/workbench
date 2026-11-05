import config from "./config";
import { useWorkspace } from "@/stores/useWorkspace";

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

/** The status pill's text for an NDIF status update, or null to leave it as is. */
function statusLabel(update: { status?: string; description?: string }): string | null {
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
 * POST to a tool's streaming endpoint and resolve with the tool's data.
 *
 * Mirrors each status update into `useWorkspace.jobStatus` for the status pill.
 * Throws on an `error` event, on a response that failed before streaming (e.g.
 * an unknown model), or on a stream that closed without data.
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

    for await (const { event, data } of parseSSE(response.body)) {
        if (event === "status") {
            const label = statusLabel(JSON.parse(data));
            if (label) setJobStatus(label);
        } else if (event === "data") {
            setJobStatus("Idle");
            return JSON.parse(data) as T;
        } else if (event === "error") {
            setJobStatus("Error");
            throw new Error(JSON.parse(data).error ?? data);
        }
    }

    setJobStatus("Error");
    throw new Error("The run ended before returning a result");
}
