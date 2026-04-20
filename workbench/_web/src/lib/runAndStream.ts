import config from "./config";
import { useWorkspace } from "@/stores/useWorkspace";

type SSEEvent = { event: string; data: string };

// Parse a stream of SSE events from a fetch ReadableStream body.
async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<SSEEvent> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });

            let sep: number;
            while ((sep = buf.indexOf("\n\n")) !== -1) {
                const raw = buf.slice(0, sep);
                buf = buf.slice(sep + 2);

                let eventName = "message";
                const dataLines: string[] = [];
                for (const line of raw.split("\n")) {
                    if (line.startsWith("event:")) {
                        eventName = line.slice(6).trim();
                    } else if (line.startsWith("data:")) {
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

/**
 * POST to an SSE endpoint that emits `status` events during execution, a single
 * `data` event with the final payload, and `error` events on failure.
 * Resolves with the parsed `data` payload or throws on `error` / protocol issues.
 */
export async function runAndStream<T>(
    endpoint: string,
    body: unknown,
    headers?: Record<string, string>,
): Promise<T> {
    const { setJobStatus } = useWorkspace.getState();
    const url = config.getApiUrl(endpoint);

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...headers,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
        setJobStatus("Error");
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    let finalData: T | null = null;
    let sseError: string | null = null;

    for await (const evt of parseSSE(response.body)) {
        if (evt.event === "status") {
            try {
                const parsed = JSON.parse(evt.data);
                if (parsed?.status) setJobStatus(parsed.status);
            } catch {
                /* ignore malformed status frame */
            }
        } else if (evt.event === "data") {
            finalData = JSON.parse(evt.data) as T;
            setJobStatus("Idle");
        } else if (evt.event === "error") {
            try {
                sseError = (JSON.parse(evt.data) as { error?: string }).error ?? evt.data;
            } catch {
                sseError = evt.data;
            }
        }
    }

    if (sseError !== null) {
        setJobStatus("Error");
        throw new Error(sseError);
    }
    if (finalData === null) {
        setJobStatus("Error");
        throw new Error("Stream ended without a data event");
    }
    return finalData;
}
