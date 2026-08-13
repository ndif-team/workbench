/**
 * Parsing for NDIF job failures.
 *
 * When a remote job fails, the poll response's `description` carries the raw
 * Python traceback from the worker — frames plus a final `Name: message` line:
 *
 *     Traceback (most recent call last):
 *       File ".../nnsightful/tools/j_lens.py", line 254, in _run
 *         results = self._format(step, model, step_ids, results=results, **kwargs)
 *       File ".../nnsightful/tools/j_lens.py", line 141, in _format
 *         p = log_p.exp()
 *
 *     OutOfMemoryError: CUDA out of memory. Tried to allocate 996.00 MiB. …
 *
 * Everything a user or a dashboard needs is in that last line; the frames are
 * for us. Splitting them apart lets the UI show "OutOfMemoryError: CUDA out of
 * memory…" instead of "Job failed", and lets analytics break failures down by
 * exception class rather than by a message containing GPU byte counts.
 */

export interface ParsedJobError {
    /** Exception class with no module path, e.g. `OutOfMemoryError`. Null when
     * the payload isn't a recognizable Python traceback. */
    name: string | null;
    /** Exception class as printed, e.g. `torch.cuda.OutOfMemoryError`. */
    qualifiedName: string | null;
    /** The exception message with the frames stripped. Falls back to the whole
     * description when no exception line could be identified. */
    message: string;
    /** The `Traceback (most recent call last):` frames, or null when absent. */
    traceback: string | null;
}

const TRACEBACK_HEADER = /^Traceback \(most recent call last\):/;

/**
 * Python prints the exception as an UNINDENTED `Qualified.Name: message` line.
 * Every frame ("  File …" and its source line) is indented, and the header has
 * spaces in its name, so "starts at column 0 and has no spaces before the
 * colon" isolates the exception line on its own.
 */
const EXCEPTION_LINE = /^([A-Za-z_][A-Za-z0-9_.]*)[ \t]*:[ \t]*(.*)$/;
/** Exceptions raised with no message print bare, e.g. `KeyboardInterrupt`. */
const BARE_EXCEPTION_LINE = /^([A-Za-z_][A-Za-z0-9_.]*)$/;

/** Guards against matching an unindented sentence in a long message. Python
 * class names are TitleCase, so check the last dotted segment. */
function looksLikeExceptionName(qualified: string): boolean {
    const short = qualified.split(".").pop() ?? "";
    return /^[A-Z][A-Za-z0-9_]*$/.test(short);
}

const EMPTY: ParsedJobError = {
    name: null,
    qualifiedName: null,
    message: "",
    traceback: null,
};

export function parseJobError(description: unknown): ParsedJobError {
    if (typeof description !== "string" || !description.trim()) return EMPTY;

    let text = description.replace(/\r\n/g, "\n");
    // Some payloads arrive with the traceback's newlines still escaped (a
    // JSON string that was stringified twice). Only unescape when there are no
    // real newlines to destroy, so a legitimate literal "\n" in a message is
    // left alone.
    if (!text.includes("\n") && text.includes("\\n")) {
        text = text.replace(/\\n/g, "\n");
    }

    const lines = text.split("\n");

    // Scan from the end: with chained exceptions ("During handling of the
    // above exception…") the LAST one is the one that actually propagated.
    let excIdx = -1;
    let qualifiedName: string | null = null;
    let firstLineMessage = "";

    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (!line.trim()) continue;
        if (/^\s/.test(line)) continue; // a traceback frame, not the exception

        const withMessage = line.match(EXCEPTION_LINE);
        if (withMessage && looksLikeExceptionName(withMessage[1])) {
            excIdx = i;
            qualifiedName = withMessage[1];
            firstLineMessage = withMessage[2];
            break;
        }
        const bare = line.match(BARE_EXCEPTION_LINE);
        if (bare && looksLikeExceptionName(bare[1])) {
            excIdx = i;
            qualifiedName = bare[1];
            firstLineMessage = "";
            break;
        }
    }

    const headerIdx = lines.findIndex((l) => TRACEBACK_HEADER.test(l));
    const hasFrames = headerIdx !== -1 && (excIdx === -1 || headerIdx < excIdx);
    const traceback = hasFrames
        ? lines
              .slice(headerIdx, excIdx === -1 ? undefined : excIdx)
              .join("\n")
              .trimEnd()
        : null;

    if (excIdx === -1) {
        // Not a traceback we recognize — hand back the whole thing rather than
        // dropping information on the floor.
        return { ...EMPTY, message: text.trim(), traceback };
    }

    // A message can run past its first line; everything after the exception
    // line belongs to it.
    const message = [firstLineMessage, ...lines.slice(excIdx + 1)].join("\n").trim();

    return {
        name: qualifiedName ? (qualifiedName.split(".").pop() ?? null) : null,
        qualifiedName,
        message,
        traceback,
    };
}

/**
 * A failed remote job, carrying the parsed exception alongside the raw frames.
 *
 * `message` reads as the Python exception did, so anything that stringifies an
 * error — a toast, `String(err)` in the analytics layer — gets the real cause
 * instead of "Job failed".
 */
export class NDIFJobError extends Error {
    /** Python exception class, e.g. `OutOfMemoryError`. Null if unparseable. */
    readonly errorName: string | null;
    readonly qualifiedErrorName: string | null;
    readonly traceback: string | null;
    readonly jobId: string;
    /** The NDIF status that ended the job. */
    readonly status: string;

    constructor(parsed: ParsedJobError, jobId: string, status: string) {
        const summary = parsed.name
            ? `${parsed.name}: ${parsed.message}`
            : parsed.message || "Job failed";
        super(summary);
        // Restores the prototype chain when targeting older JS, so
        // `instanceof NDIFJobError` holds for consumers.
        Object.setPrototypeOf(this, NDIFJobError.prototype);

        this.name = "NDIFJobError";
        this.errorName = parsed.name;
        this.qualifiedErrorName = parsed.qualifiedName;
        this.traceback = parsed.traceback;
        this.jobId = jobId;
        this.status = status;
    }
}

/**
 * Exception classes we can say something useful about. The raw message is for
 * the console — it carries allocator hints and byte counts — so a toast gets
 * the actionable version instead.
 */
const ACTIONABLE_MESSAGES: Record<string, string> = {
    OutOfMemoryError:
        "The GPU ran out of memory. Try a shorter prompt, a lower top-k, or a smaller model.",
};

/**
 * User-facing copy for a failed run.
 *
 * Known exception classes get advice. An unrecognized remote failure still
 * names its exception class, which is worth surfacing to a research audience —
 * "…(ValueError)" tells them where to look, where a bare "Failed to compute"
 * does not. Anything that isn't a remote job failure keeps the caller's copy.
 */
export function runErrorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof NDIFJobError)) return fallback;
    if (error.errorName && ACTIONABLE_MESSAGES[error.errorName]) {
        return ACTIONABLE_MESSAGES[error.errorName];
    }
    return error.errorName ? `${fallback} (${error.errorName})` : fallback;
}

/**
 * Low-cardinality label for an error, for analytics breakdowns.
 *
 * Prefers the Python exception class, since the message itself carries GPU
 * byte counts and allocation sizes and would explode a breakdown into one row
 * per failure.
 */
export function errorTypeOf(error: unknown): string | null {
    if (error instanceof NDIFJobError) return error.errorName ?? error.status;
    if (error instanceof Error) return error.name || null;
    return null;
}

/**
 * The NDIF job behind a failure, for joining a reported error back to the
 * worker that produced it (and to the backend's InfluxDB telemetry, which is
 * keyed the same way).
 *
 * Null whenever no job existed: a run that failed before one was created (a
 * rejected start request, a tokenizer error), or local mode, where the backend
 * returns data inline with no job id at all.
 */
export function ndifJobIdOf(error: unknown): string | null {
    return error instanceof NDIFJobError ? error.jobId : null;
}
