/**
 * Parsing for NDIF job failures.
 *
 * A failed remote job reports the worker's Python traceback: frames, then a
 * final `Name: message` line:
 *
 *     Traceback (most recent call last):
 *       File ".../nnsightful/tools/j_lens.py", line 141, in _format
 *         p = log_p.exp()
 *
 *     OutOfMemoryError: CUDA out of memory. Tried to allocate 996.00 MiB. …
 *
 * Splitting the two lets the UI say "OutOfMemoryError: CUDA out of memory…"
 * instead of "Job failed", and lets analytics break failures down by exception
 * class rather than by a message full of GPU byte counts.
 */

export interface ParsedJobError {
    /** Exception class without its module path, e.g. `OutOfMemoryError`; null
     * when the text isn't a recognizable Python traceback. */
    name: string | null;
    /** Exception class as printed, e.g. `torch.cuda.OutOfMemoryError`. */
    qualifiedName: string | null;
    /** The exception message without the frames, or the whole text when no
     * exception line was found. */
    message: string;
    /** The `Traceback (most recent call last):` frames, or null when absent. */
    traceback: string | null;
}

const TRACEBACK_HEADER = /^Traceback \(most recent call last\):/;
const EXCEPTION_LINE = /^([A-Za-z_][A-Za-z0-9_.]*)[ \t]*:[ \t]*(.*)$/;
const BARE_EXCEPTION_LINE = /^([A-Za-z_][A-Za-z0-9_.]*)$/;

const EMPTY: ParsedJobError = { name: null, qualifiedName: null, message: "", traceback: null };

/** Whether a dotted name ends in a TitleCase segment, as Python class names do. */
function looksLikeExceptionName(qualified: string): boolean {
    const short = qualified.split(".").pop() ?? "";
    return /^[A-Z][A-Za-z0-9_]*$/.test(short);
}

/**
 * Splits a failure's text into exception class, message and frames.
 *
 * Python prints the exception as an unindented `Qualified.Name: message` line,
 * while every frame is indented and the traceback header has spaces in its
 * name, so the exception line is the last unindented line that reads as one.
 * Taking the last one reports what propagated out of a chained traceback
 * ("During handling of the above exception…"). Text whose newlines arrive
 * escaped (a JSON string encoded twice) is unescaped first, but only when it
 * has no real newlines.
 */
export function parseJobError(description: unknown): ParsedJobError {
    if (typeof description !== "string" || !description.trim()) return EMPTY;

    let text = description.replace(/\r\n/g, "\n");
    if (!text.includes("\n") && text.includes("\\n")) {
        text = text.replace(/\\n/g, "\n");
    }

    const lines = text.split("\n");
    let excIdx = -1;
    let qualifiedName: string | null = null;
    let firstLineMessage = "";

    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (!line.trim() || /^\s/.test(line)) continue;

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

    if (excIdx === -1) return { ...EMPTY, message: text.trim(), traceback };

    const message = [firstLineMessage, ...lines.slice(excIdx + 1)].join("\n").trim();
    return {
        name: qualifiedName ? (qualifiedName.split(".").pop() ?? null) : null,
        qualifiedName,
        message,
        traceback,
    };
}

/**
 * A failed remote job, carrying the parsed exception and the job's id.
 *
 * Its `message` reads as the Python exception did, so anything that
 * stringifies the error (a toast, the console, `run_failed`) gets the real
 * cause instead of "Job failed".
 */
export class NDIFJobError extends Error {
    /** Python exception class, e.g. `OutOfMemoryError`; null if unparseable. */
    readonly errorName: string | null;
    readonly qualifiedErrorName: string | null;
    readonly traceback: string | null;
    /** The NDIF job, or null when the failure came before one existed. */
    readonly jobId: string | null;
    /** The NDIF status that ended the job. */
    readonly status: string;

    constructor(parsed: ParsedJobError, jobId: string | null, status: string) {
        super(parsed.name ? `${parsed.name}: ${parsed.message}` : parsed.message || "Job failed");
        Object.setPrototypeOf(this, NDIFJobError.prototype);
        this.name = "NDIFJobError";
        this.errorName = parsed.name;
        this.qualifiedErrorName = parsed.qualifiedName;
        this.traceback = parsed.traceback;
        this.jobId = jobId;
        this.status = status;
    }

    /** Logs a one-line summary, then the frames, or `raw` (the payload the
     * failure came in) when there were none, so the cause isn't lost. */
    log(raw: unknown): void {
        console.error(`[NDIF ${this.status}] job ${this.jobId ?? "(none)"}: ${this.message}`);
        if (this.traceback) console.error(this.traceback);
        else console.error("Raw NDIF response:", raw);
    }

    /** Exception classes with advice to give; the raw message (allocator hints,
     * byte counts) stays in the console. */
    static readonly ACTIONABLE_MESSAGES: Record<string, string> = {
        OutOfMemoryError:
            "The GPU ran out of memory. Try a shorter prompt, a lower top-k, or a smaller model.",
    };
}

/**
 * User-facing copy for a failed run: advice for a known exception class, the
 * caller's copy plus the class name for any other remote failure (it tells a
 * researcher where to look), and the caller's copy for everything else.
 */
export function runErrorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof NDIFJobError)) return fallback;
    const advice = error.errorName && NDIFJobError.ACTIONABLE_MESSAGES[error.errorName];
    if (advice) return advice;
    return error.errorName ? `${fallback} (${error.errorName})` : fallback;
}

/**
 * Low-cardinality label for an error, for analytics breakdowns: the Python
 * exception class for a remote failure (its message carries byte counts and
 * would make one row per failure), else the JS error's name.
 */
export function errorTypeOf(error: unknown): string | null {
    if (error instanceof NDIFJobError) return error.errorName ?? error.status;
    if (error instanceof Error) return error.name || null;
    return null;
}

/**
 * The NDIF job behind a failure, for joining a reported error back to the job
 * that produced it. Null when no job existed: a run that failed before one was
 * created, or a local run, which has no job id at all.
 */
export function ndifJobIdOf(error: unknown): string | null {
    return error instanceof NDIFJobError ? error.jobId : null;
}
