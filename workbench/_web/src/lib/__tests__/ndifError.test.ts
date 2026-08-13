import { describe, expect, test } from "bun:test";

import {
    NDIFJobError,
    errorTypeOf,
    ndifJobIdOf,
    parseJobError,
    runErrorMessage,
} from "../ndifError";

// The real shape of a failed j-lens job's `description`, as returned by the
// NDIF status endpoint.
const CUDA_OOM = `Traceback (most recent call last):
  File "/home/localadam/work/workbench-dev/workbench-j-lens/.venv/lib/python3.12/site-packages/nnsightful/tools/j_lens.py", line 254, in _run
    results = self._format(step, model, step_ids, results=results, **kwargs)
  File "/home/localadam/work/workbench-dev/workbench-j-lens/.venv/lib/python3.12/site-packages/nnsightful/tools/j_lens.py", line 141, in _format
    p = log_p.exp()

OutOfMemoryError: CUDA out of memory. Tried to allocate 996.00 MiB. GPU 0 has a total capacity of 44.43 GiB of which 9.06 GiB is free. Process 2102129 has 17.54 GiB memory in use. Including non-PyTorch memory, this process has 17.81 GiB memory in use. 17.69 GiB allowed; Of the allocated memory 17.44 GiB is allocated by PyTorch, and 59.88 MiB is reserved by PyTorch but unallocated. If reserved but unallocated memory is large try setting PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True to avoid fragmentation. See documentation for Memory Management (https://pytorch.org/docs/stable/notes/cuda.html#environment-variables)`;

describe("parseJobError", () => {
    test("pulls the exception name out of a CUDA OOM traceback", () => {
        const parsed = parseJobError(CUDA_OOM);
        expect(parsed.name).toBe("OutOfMemoryError");
        expect(parsed.qualifiedName).toBe("OutOfMemoryError");
    });

    test("message starts at the exception and excludes the frames", () => {
        const { message } = parseJobError(CUDA_OOM);
        expect(message.startsWith("CUDA out of memory. Tried to allocate 996.00 MiB.")).toBe(true);
        expect(message).not.toContain("Traceback");
        expect(message).not.toContain("j_lens.py");
        // The trailing URL is part of the message and must survive intact.
        expect(message.endsWith("#environment-variables)")).toBe(true);
    });

    test("traceback keeps every frame and stops before the exception line", () => {
        const { traceback } = parseJobError(CUDA_OOM);
        expect(traceback).not.toBeNull();
        expect(traceback!.startsWith("Traceback (most recent call last):")).toBe(true);
        expect(traceback).toContain("line 254, in _run");
        expect(traceback).toContain("line 141, in _format");
        expect(traceback).toContain("p = log_p.exp()");
        expect(traceback).not.toContain("OutOfMemoryError");
    });

    test("strips the module path off a qualified exception name", () => {
        const parsed = parseJobError(
            'Traceback (most recent call last):\n  File "x.py", line 1, in f\n    g()\n\ntorch.cuda.OutOfMemoryError: boom',
        );
        expect(parsed.name).toBe("OutOfMemoryError");
        expect(parsed.qualifiedName).toBe("torch.cuda.OutOfMemoryError");
        expect(parsed.message).toBe("boom");
    });

    test("handles an exception raised with no message", () => {
        const parsed = parseJobError(
            'Traceback (most recent call last):\n  File "x.py", line 1, in f\n    g()\n\nKeyboardInterrupt',
        );
        expect(parsed.name).toBe("KeyboardInterrupt");
        expect(parsed.message).toBe("");
    });

    test("takes the last exception in a chained traceback", () => {
        const chained = [
            "Traceback (most recent call last):",
            '  File "a.py", line 1, in f',
            "    raise ValueError('inner')",
            "ValueError: inner",
            "",
            "During handling of the above exception, another exception occurred:",
            "",
            "Traceback (most recent call last):",
            '  File "b.py", line 2, in g',
            "    boom()",
            "RuntimeError: outer",
        ].join("\n");
        // The one that actually propagated is what a dashboard should count.
        expect(parseJobError(chained).name).toBe("RuntimeError");
        expect(parseJobError(chained).message).toBe("outer");
    });

    test("keeps a multi-line exception message whole", () => {
        const parsed = parseJobError(
            'Traceback (most recent call last):\n  File "x.py", line 1, in f\n    g()\n\nValueError: first line\nsecond line',
        );
        expect(parsed.name).toBe("ValueError");
        expect(parsed.message).toBe("first line\nsecond line");
    });

    test("unescapes a traceback whose newlines were double-encoded", () => {
        const escaped =
            'Traceback (most recent call last):\\n  File "x.py", line 1, in f\\n    g()\\n\\nOutOfMemoryError: CUDA out of memory';
        const parsed = parseJobError(escaped);
        expect(parsed.name).toBe("OutOfMemoryError");
        expect(parsed.message).toBe("CUDA out of memory");
    });

    test("falls back to the whole description when it isn't a traceback", () => {
        const parsed = parseJobError("worker died unexpectedly");
        expect(parsed.name).toBeNull();
        expect(parsed.traceback).toBeNull();
        expect(parsed.message).toBe("worker died unexpectedly");
    });

    test("does not mistake a prose sentence for an exception name", () => {
        // "Something went wrong: try again" has spaces before the colon, so it
        // must not be read as a class named "Something went wrong".
        const parsed = parseJobError("Something went wrong: try again");
        expect(parsed.name).toBeNull();
        expect(parsed.message).toBe("Something went wrong: try again");
    });

    test.each([[undefined], [null], [""], ["   "], [42], [{}]])(
        "returns an empty result for %p",
        (input) => {
            const parsed = parseJobError(input);
            expect(parsed.name).toBeNull();
            expect(parsed.message).toBe("");
            expect(parsed.traceback).toBeNull();
        },
    );
});

describe("NDIFJobError", () => {
    test("reads as the Python exception did when stringified", () => {
        const err = new NDIFJobError(parseJobError(CUDA_OOM), "job-123", "ERROR");
        expect(String(err)).toContain("OutOfMemoryError: CUDA out of memory");
        expect(err.errorName).toBe("OutOfMemoryError");
        expect(err.jobId).toBe("job-123");
        expect(err.status).toBe("ERROR");
        expect(err.traceback).toContain("j_lens.py");
        expect(err instanceof Error).toBe(true);
        expect(err instanceof NDIFJobError).toBe(true);
    });

    test("falls back to a generic message when nothing parsed", () => {
        const err = new NDIFJobError(parseJobError(null), "job-9", "ERROR");
        expect(err.message).toBe("Job failed");
    });
});

describe("runErrorMessage", () => {
    const FALLBACK = "Failed to compute logit lens visualization";

    test("gives actionable advice for a CUDA OOM instead of the raw message", () => {
        const err = new NDIFJobError(parseJobError(CUDA_OOM), "job-1", "ERROR");
        const msg = runErrorMessage(err, FALLBACK);
        expect(msg).toBe(
            "The GPU ran out of memory. Try a shorter prompt, a lower top-k, or a smaller model.",
        );
        // The allocator detail belongs in the console, not a toast.
        expect(msg).not.toContain("PYTORCH_CUDA_ALLOC_CONF");
        expect(msg).not.toContain("GiB");
    });

    test("names the exception class for remote failures it has no advice for", () => {
        const err = new NDIFJobError(
            parseJobError(
                'Traceback (most recent call last):\n  File "x.py", line 1, in f\n    g()\n\nValueError: bad shape',
            ),
            "job-1",
            "ERROR",
        );
        expect(runErrorMessage(err, FALLBACK)).toBe(`${FALLBACK} (ValueError)`);
    });

    test("uses the plain fallback when the traceback was unparseable", () => {
        const err = new NDIFJobError(parseJobError("worker vanished"), "job-1", "ERROR");
        expect(runErrorMessage(err, FALLBACK)).toBe(FALLBACK);
    });

    test("leaves non-job errors with the caller's copy", () => {
        expect(runErrorMessage(new TypeError("nope"), FALLBACK)).toBe(FALLBACK);
        expect(runErrorMessage("a string", FALLBACK)).toBe(FALLBACK);
        expect(runErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
    });
});

describe("ndifJobIdOf", () => {
    test("returns the job id from a remote failure", () => {
        const err = new NDIFJobError(parseJobError(CUDA_OOM), "job-abc", "ERROR");
        expect(ndifJobIdOf(err)).toBe("job-abc");
    });

    test("returns null when the run failed before a job existed", () => {
        // e.g. a rejected start request, a tokenizer failure, or local mode.
        expect(ndifJobIdOf(new Error("Failed to start job (HTTP 502)"))).toBeNull();
        expect(ndifJobIdOf("a string")).toBeNull();
        expect(ndifJobIdOf(undefined)).toBeNull();
    });
});

describe("errorTypeOf", () => {
    test("prefers the Python exception class", () => {
        const err = new NDIFJobError(parseJobError(CUDA_OOM), "job-1", "ERROR");
        expect(errorTypeOf(err)).toBe("OutOfMemoryError");
    });

    test("falls back to the NDIF status when the traceback was unparseable", () => {
        const err = new NDIFJobError(parseJobError("¯\\_(ツ)_/¯"), "job-1", "WORKER_ERROR");
        expect(errorTypeOf(err)).toBe("WORKER_ERROR");
    });

    test("uses the constructor name for ordinary errors", () => {
        expect(errorTypeOf(new TypeError("nope"))).toBe("TypeError");
        expect(errorTypeOf(new Error("plain"))).toBe("Error");
    });

    test("returns null for non-errors", () => {
        expect(errorTypeOf("a string")).toBeNull();
        expect(errorTypeOf(undefined)).toBeNull();
    });
});
