/**
 * Unit tests for the SSE tool-run client: parsing, the status pill, the job
 * sink, and how a run ends (data, error event, failed response, or a stream
 * that just closes).
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { NDIFJobError } from "@/lib/ndifError";
import type { JobSink } from "@/lib/ndifJob";
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

/** A body that delivers each chunk only when it's read, setting `clock` to its time first. */
function timedBody(chunks: [number, string][], clock: { now: number }) {
    let next = 0;
    return new ReadableStream<Uint8Array>(
        {
            pull(controller) {
                if (next === chunks.length) return controller.close();
                const [at, chunk] = chunks[next++];
                clock.now = at;
                controller.enqueue(encoder.encode(chunk));
            },
        },
        { highWaterMark: 0 },
    );
}

const status = (s: string, description = "") =>
    `event: status\ndata: ${JSON.stringify({ id: "job", status: s, description })}\n\n`;

/** What `run` rejected with. */
async function rejectionOf<E extends Error = NDIFJobError>(run: Promise<unknown>): Promise<E> {
    try {
        await run;
    } catch (error) {
        return error as E;
    }
    throw new Error("Expected the run to fail");
}

const errorEvent = (payload: object) => `event: error\ndata: ${JSON.stringify(payload)}\n\n`;

const TRACEBACK =
    'Traceback (most recent call last):\n  File "/usr/lib/python3.12/site-packages/nnsightful/tools/logit_lens.py", line 9, in _run\n    x = y[3]\n\nIndexError: index out of range';

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
    const realNow = Date.now;
    let statuses: string[];
    let unsubscribe: () => void;
    let logged: ReturnType<typeof spyOn<Console, "error">>;

    const respond = (response: Response) => {
        globalThis.fetch = mock(async () => response) as unknown as typeof fetch;
    };

    beforeEach(() => {
        useWorkspace.setState({ jobStatus: "Idle" });
        statuses = [];
        unsubscribe = useWorkspace.subscribe((state) => statuses.push(state.jobStatus));
        logged = spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        unsubscribe();
        globalThis.fetch = realFetch;
        Date.now = realNow;
        logged.mockRestore();
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

        const error = await rejectionOf<Error>(runAndStream("/j_lens/run", {}));
        expect(error.message).toBe("Model not found");
        expect(error).not.toBeInstanceOf(NDIFJobError);
        expect(statuses.at(-1)).toBe("Error");
    });

    it("throws when the stream closes without data", async () => {
        respond(new Response(body([status("RUNNING")])));

        await expect(runAndStream("/logit_lens/run", {})).rejects.toThrow(
            "The run ended before returning a result",
        );
        expect(statuses).toEqual(["RUNNING", "Error"]);
    });

    describe("job sink", () => {
        it("records the job with its QUEUED window and its time to data", async () => {
            const clock = { now: 0 };
            Date.now = () => clock.now;
            respond(
                new Response(
                    timedBody(
                        [
                            [0, status("RECEIVED")],
                            [1000, status("QUEUED", "Position in queue: 2")],
                            [2000, status("QUEUED", "Position in queue: 1")],
                            [3000, status("RUNNING")],
                            [3500, status("LOG", "a print from the run")],
                            [4000, status("COMPLETED")],
                            [5000, "event: data\ndata: 1\n\n"],
                        ],
                        clock,
                    ),
                ),
            );
            const jobs: JobSink = [];

            expect(await runAndStream<number>("/logit_lens/run", {}, undefined, jobs)).toBe(1);
            expect(jobs).toEqual([{ jobId: "job", queueWaitMs: 2000, totalMs: 5000 }]);
        });

        it("reports zero queue time for a job that was never queued", async () => {
            respond(new Response(body([status("RUNNING"), "event: data\ndata: 1\n\n"])));
            const jobs: JobSink = [];

            await runAndStream("/logit_lens/run", {}, undefined, jobs);
            expect(jobs).toHaveLength(1);
            expect(jobs[0].queueWaitMs).toBe(0);
        });

        it("records a job that failed, without times", async () => {
            respond(new Response(body([status("QUEUED"), errorEvent({ error: "boom" })])));
            const jobs: JobSink = [];

            await expect(runAndStream("/logit_lens/run", {}, undefined, jobs)).rejects.toThrow();
            expect(jobs).toEqual([{ jobId: "job", queueWaitMs: null, totalMs: null }]);
        });

        it("records nothing for a local run, which reports no job", async () => {
            respond(new Response(body(["event: data\ndata: 1\n\n"])));
            const jobs: JobSink = [];

            await runAndStream("/logit_lens/run", {}, undefined, jobs);
            expect(jobs).toEqual([]);
        });
    });

    describe("failures", () => {
        it("throws an NDIFJobError parsed from the ERROR status's traceback", async () => {
            respond(
                new Response(
                    body([
                        status("RUNNING"),
                        status("ERROR", TRACEBACK),
                        errorEvent({ error: "Job failed on NDIF", type: "RemoteException" }),
                    ]),
                ),
            );

            const error = await rejectionOf(runAndStream("/logit_lens/run", {}));
            expect(error).toBeInstanceOf(NDIFJobError);
            expect(error.message).toBe("IndexError: index out of range");
            expect(error.errorName).toBe("IndexError");
            expect(error.traceback).toContain("logit_lens.py");
            expect(error.jobId).toBe("job");
            expect(error.status).toBe("ERROR");
            expect(logged.mock.calls[0][0]).toBe(
                "[NDIF ERROR] job job: IndexError: index out of range",
            );
            expect(String(logged.mock.calls[1][0])).toStartWith("Traceback");
        });

        it("names a bare error event's failure by its exception type", async () => {
            respond(
                new Response(
                    body([
                        status("RUNNING"),
                        errorEvent({ error: "index 7 is out of bounds", type: "IndexError" }),
                    ]),
                ),
            );

            const error = await rejectionOf(runAndStream("/logit_lens/run", {}));
            expect(error).toBeInstanceOf(NDIFJobError);
            expect(error.message).toBe("IndexError: index 7 is out of bounds");
            expect(error.errorName).toBe("IndexError");
            expect(error.traceback).toBeNull();
            expect(error.jobId).toBe("job");
            expect(error.status).toBe("ERROR");
        });

        it("prefers a traceback in the error event's message to its type", async () => {
            respond(new Response(body([errorEvent({ error: TRACEBACK, type: "RuntimeError" })])));

            const error = await rejectionOf(runAndStream("/logit_lens/run", {}));
            expect(error).toBeInstanceOf(NDIFJobError);
            expect(error.errorName).toBe("IndexError");
            expect(error.jobId).toBeNull();
        });

        it("keeps the message of an error event from a backend without `type`", async () => {
            respond(new Response(body([errorEvent({ error: "worker vanished" })])));

            const error = await rejectionOf(runAndStream("/logit_lens/run", {}));
            expect(error).toBeInstanceOf(NDIFJobError);
            expect(error.message).toBe("worker vanished");
            expect(error.errorName).toBeNull();
        });
    });
});
