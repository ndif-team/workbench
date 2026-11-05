/**
 * One NDIF job a run dispatched, as the run's telemetry reports it.
 *
 * `queueWaitMs` is how long the job was reported QUEUED: from the first status
 * saying QUEUED to the first saying anything else (0 when it was never seen
 * queued). `totalMs` runs from dispatch to completion, so `totalMs -
 * queueWaitMs` is the closest measure of execution time from outside. Both are
 * null while the job is in flight and when it failed.
 */
export interface JobRecord {
    jobId: string;
    queueWaitMs: number | null;
    totalMs: number | null;
}

/**
 * Collects the jobs a run dispatched. A run hands one down to the code that
 * talks to NDIF (`runAndStream`, `startAndPoll`), which records each job it
 * sees, so job ids and timings reach the run's telemetry without changing what
 * those functions return. A run can dispatch several jobs (a Patch Lens run
 * lenses its source and target prompts in parallel).
 */
export type JobSink = JobRecord[];

/**
 * An NDIF job followed through its statuses, whether polled (`startAndPoll`)
 * or streamed (`runAndStream`), and timed into a `JobSink`.
 *
 * The job is recorded as soon as it is followed, so one that fails still
 * reaches the sink, and `complete` fills in its times. Its clock starts then
 * too: when a polled job's id comes back, or with a streamed job's first
 * status.
 */
export class NDIFJob {
    /** Statuses that end a job as failed. */
    static readonly FAILURE_STATUSES: ReadonlySet<string> = new Set(["ERROR", "NNSIGHT_ERROR"]);

    private readonly record: JobRecord;
    private readonly startedAt = Date.now();
    private queuedAt: number | null = null;
    private queueEndedAt: number | null = null;

    constructor(jobId: string, jobs?: JobSink) {
        this.record = { jobId, queueWaitMs: null, totalMs: null };
        jobs?.push(this.record);
    }

    static isFailure(status: unknown): status is string {
        return typeof status === "string" && NDIFJob.FAILURE_STATUSES.has(status);
    }

    /** Opens the QUEUED window on the first QUEUED status and closes it on the
     * first status after (COMPLETED included); a later QUEUED doesn't reopen it. */
    observe(status: string | undefined): void {
        const now = Date.now();
        if (status === "QUEUED") this.queuedAt ??= now;
        else if (this.queuedAt !== null) this.queueEndedAt ??= now;
    }

    /** The job's result arrived: record how its time was spent. */
    complete(): void {
        const now = Date.now();
        this.record.queueWaitMs =
            this.queuedAt === null ? 0 : (this.queueEndedAt ?? now) - this.queuedAt;
        this.record.totalMs = now - this.startedAt;
    }
}
