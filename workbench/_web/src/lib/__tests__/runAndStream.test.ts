/**
 * Unit tests for the SSE tool-run client: parsing, the status pill, and how a
 * run ends (data, error event, failed response, or a stream that just closes).
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { parseSSE, runAndStream, type SSEEvent } from "@/lib/runAndStream";
import { useWorkspace } from "@/stores/useWorkspace";

const encoder = new TextEncoder();

/** A body that delivers `chunks` as separate reads; left open unless `close`. */
function body(chunks: string[], { close = true, onCancel = () => {} } = {}) {
    return new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            if (close) controller.close();
        },
        cancel: onCancel,
    });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<SSEEvent[]> {
    const events: SSEEvent[] = [];
    for await (const event of parseSSE(stream)) events.push(event);
    return events;
}

const status = (s: string, description = "") =>
    `event: status\ndata: ${JSON.stringify({ id: "job", status: s, description })}\n\n`;

describe("parseSSE", () => {
    it("reassembles events split across reads", async () => {
        const events = await collect(
            body(["event: sta", 'tus\ndata: {"a"', ": 1}\n", "\nevent: data\ndata: 2\n\n"]),
        );
        expect(events).toEqual([
            { event: "status", data: '{"a": 1}' },
            { event: "data", data: "2" },
        ]);
    });

    it("skips comments, joins multi-line data and defaults the event name", async () => {
        const events = await collect(body([": keepalive\n\n", "data: one\ndata: two\n\n"]));
        expect(events).toEqual([{ event: "message", data: "one\ntwo" }]);
    });
});

describe("runAndStream", () => {
    const realFetch = globalThis.fetch;
    let statuses: string[];
    let unsubscribe: () => void;

    const respond = (response: Response) => {
        globalThis.fetch = mock(async () => response) as unknown as typeof fetch;
    };

    beforeEach(() => {
        useWorkspace.setState({ jobStatus: "Idle" });
        statuses = [];
        unsubscribe = useWorkspace.subscribe((state) => statuses.push(state.jobStatus));
    });

    afterEach(() => {
        unsubscribe();
        globalThis.fetch = realFetch;
    });

    it("mirrors statuses into the pill and resolves with the data", async () => {
        respond(
            new Response(
                body([
                    status("RECEIVED"),
                    ": keepalive\n\n",
                    status("QUEUED", "Position in queue: 3"),
                    status("LOG", "a print from the run"),
                    status("RUNNING"),
                    status("COMPLETED"),
                    'event: data\ndata: {"values": [1, 2]}\n\n',
                ]),
            ),
        );

        const data = await runAndStream<{ values: number[] }>("/logit_lens/run", { prompt: "p" });

        expect(data).toEqual({ values: [1, 2] });
        expect(statuses).toEqual(["RECEIVED", "QUEUED: 3", "RUNNING", "COMPLETED", "Idle"]);
        const [url, init] = (globalThis.fetch as unknown as ReturnType<typeof mock>).mock.calls[0];
        expect(url).toEndWith("/logit_lens/run");
        expect(init.method).toBe("POST");
        expect(init.body).toBe(JSON.stringify({ prompt: "p" }));
    });

    it("closes the connection once the data arrives", async () => {
        let cancelled = false;
        respond(
            new Response(
                body(["event: data\ndata: 1\n\n"], {
                    close: false,
                    onCancel: () => {
                        cancelled = true;
                    },
                }),
            ),
        );

        expect(await runAndStream<number>("/logit_lens/run", {})).toBe(1);
        expect(cancelled).toBe(true);
    });

    it("throws the message of an error event", async () => {
        respond(
            new Response(
                body([
                    status("ERROR", "index out of range"),
                    'event: error\ndata: {"error": "index out of range"}\n\n',
                ]),
            ),
        );

        await expect(runAndStream("/activation_patching/run", {})).rejects.toThrow(
            "index out of range",
        );
        expect(statuses.at(-1)).toBe("Error");
    });

    it("throws FastAPI's detail for a response that failed before streaming", async () => {
        respond(new Response(JSON.stringify({ detail: "Model not found" }), { status: 404 }));

        await expect(runAndStream("/j_lens/run", {})).rejects.toThrow("Model not found");
        expect(statuses.at(-1)).toBe("Error");
    });

    it("throws when the stream closes without data", async () => {
        respond(new Response(body([status("RUNNING")])));

        await expect(runAndStream("/logit_lens/run", {})).rejects.toThrow(
            "The run ended before returning a result",
        );
        expect(statuses).toEqual(["RUNNING", "Error"]);
    });
});
