import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { NDIFJobError } from "../ndifError";
import type { JobSink } from "../ndifJob";
import { startAndPoll } from "../startAndPoll";

/**
 * Drives startAndPoll through a scripted sequence of NDIF statuses.
 *
 * Time is simulated: `setTimeout` fires immediately but advances a fake clock
 * by one poll interval, so a run of N polls takes no real time while still
 * producing the millisecond gaps the timing logic measures.
 */
const POLL_MS = 1000;

const realNow = Date.now;
const realSetTimeout = globalThis.setTimeout;
const realFetch = globalThis.fetch;

let logged: ReturnType<typeof spyOn<Console, "error">>;

beforeEach(() => {
    logged = spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    Date.now = realNow;
    globalThis.setTimeout = realSetTimeout;
    globalThis.fetch = realFetch;
    logged.mockRestore();
});

type Poll = { status: string; description?: string };

function startWithPolls(polls: (string | Poll)[], jobs: JobSink, start = { ok: true }) {
    let clock = 0;
    Date.now = () => clock;
    globalThis.setTimeout = ((fn: () => void) => {
        clock += POLL_MS;
        fn();
        return 0;
    }) as unknown as typeof setTimeout;

    let poll = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST" && url.includes("/start")) {
            return start.ok
                ? new Response(JSON.stringify({ job_id: "job-1" }), { status: 200 })
                : new Response("bad gateway", { status: 502 });
        }
        if (init?.method === "POST") {
            return new Response(JSON.stringify({ data: { ok: true } }), { status: 200 });
        }
        const next = polls[Math.min(poll++, polls.length - 1)];
        return new Response(JSON.stringify(typeof next === "string" ? { status: next } : next), {
            status: 200,
        });
    }) as typeof fetch;

    return startAndPoll<unknown>(
        "/causal_mediation/start",
        {},
        (id) => `/causal_mediation/results/${id}`,
        undefined,
        jobs,
    );
}

/** What `run` rejected with. */
async function rejectionOf<E extends Error = NDIFJobError>(run: Promise<unknown>): Promise<E> {
    try {
        await run;
    } catch (error) {
        return error as E;
    }
    throw new Error("Expected the run to fail");
}

async function runWithStatuses(statuses: string[]): Promise<JobSink> {
    const jobs: JobSink = [];
    await startWithPolls(statuses, jobs);
    return jobs;
}

describe("job timing", () => {
    test("measures the QUEUED window, not the whole job", async () => {
        // t=0 QUEUED, t=1000 QUEUED, t=2000 RUNNING, t=3000 COMPLETED
        const [job] = await runWithStatuses(["QUEUED", "QUEUED", "RUNNING", "COMPLETED"]);
        expect(job.queueWaitMs).toBe(2000);
        expect(job.totalMs).toBe(3000);
        // The point of splitting them: the job ran for a second after a
        // two-second queue, and those must not be conflated.
        expect(job.totalMs! - job.queueWaitMs!).toBe(1000);
    });

    test("reports zero queue time for a job that was never queued", async () => {
        const [job] = await runWithStatuses(["RUNNING", "COMPLETED"]);
        expect(job.queueWaitMs).toBe(0);
        expect(job.totalMs).toBe(1000);
    });

    test("closes the queue window when COMPLETED follows QUEUED directly", async () => {
        // No intermediate status is ever observed, so the queue ends at
        // COMPLETED rather than being left open.
        const [job] = await runWithStatuses(["QUEUED", "COMPLETED"]);
        expect(job.queueWaitMs).toBe(1000);
        expect(job.totalMs).toBe(1000);
    });

    test("does not reopen the queue window if QUEUED reappears", async () => {
        // Defensive: a status flapping back to QUEUED shouldn't restart the
        // measurement or push the end time later.
        const [job] = await runWithStatuses(["QUEUED", "RUNNING", "QUEUED", "COMPLETED"]);
        expect(job.queueWaitMs).toBe(1000);
        expect(job.totalMs).toBe(3000);
    });

    test("records the job id before the wait, so it survives a failure", async () => {
        const jobs: JobSink = [];
        await expect(startWithPolls(["QUEUED", "ERROR"], jobs)).rejects.toThrow();
        expect(jobs).toEqual([{ jobId: "job-1", queueWaitMs: null, totalMs: null }]);
    });
});

describe("failures", () => {
    const TRACEBACK =
        'Traceback (most recent call last):\n  File "/usr/lib/python3.12/site-packages/nnsightful/tools/logit_lens.py", line 9, in _run\n    x = y[3]\n\nIndexError: index out of range';

    test.each(["ERROR", "NNSIGHT_ERROR"])(
        "throws an NDIFJobError parsed from a %s status's traceback",
        async (status) => {
            const error = await rejectionOf(
                startWithPolls([{ status, description: TRACEBACK }], []),
            );
            expect(error).toBeInstanceOf(NDIFJobError);
            expect(error.message).toBe("IndexError: index out of range");
            expect(error.errorName).toBe("IndexError");
            expect(error.jobId).toBe("job-1");
            expect(error.status).toBe(status);
            expect(error.traceback).toContain("logit_lens.py");
            expect(String(logged.mock.calls[0][0])).toBe(
                `[NDIF ${status}] job job-1: IndexError: index out of range`,
            );
        },
    );

    test("says which request failed to start a job", async () => {
        await expect(startWithPolls([], [], { ok: false })).rejects.toThrow(
            /^Failed to start job \(HTTP 502 from .*\/causal_mediation\/start\)$/,
        );
    });

    test("names the job that timed out", async () => {
        await expect(startWithPolls(["QUEUED"], [])).rejects.toThrow(
            "Timed out after 300s waiting for job job-1",
        );
    });
});
