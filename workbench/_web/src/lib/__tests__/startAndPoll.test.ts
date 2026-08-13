import { afterEach, describe, expect, test } from "bun:test";

import { startAndPoll, type JobSink } from "../startAndPoll";

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

afterEach(() => {
    Date.now = realNow;
    globalThis.setTimeout = realSetTimeout;
    globalThis.fetch = realFetch;
});

function runWithStatuses(statuses: string[]): Promise<JobSink> {
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
            return new Response(JSON.stringify({ job_id: "job-1" }), { status: 200 });
        }
        if (init?.method === "POST") {
            return new Response(JSON.stringify({ data: { ok: true } }), { status: 200 });
        }
        const status = statuses[Math.min(poll++, statuses.length - 1)];
        return new Response(JSON.stringify({ status }), { status: 200 });
    }) as typeof fetch;

    const jobs: JobSink = [];
    return startAndPoll<unknown>(
        "/logit_lens/start",
        {},
        (id) => `/logit_lens/results/${id}`,
        undefined,
        jobs,
    ).then(() => jobs);
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
        const jobs = await runWithStatuses(["COMPLETED"]);
        expect(jobs).toHaveLength(1);
        expect(jobs[0].jobId).toBe("job-1");
    });
});
