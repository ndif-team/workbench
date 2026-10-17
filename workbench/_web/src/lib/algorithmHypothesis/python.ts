/**
 * Runs custom Python-function variables in a Pyodide worker.
 *
 * The engine evaluates synchronously, so `runPython` never waits: it returns a
 * cached result, or `pending` and queues the call. When results arrive the
 * runtime's `version` changes and components that evaluate re-render, reading
 * the new results from the cache. Pyodide loads on the first call.
 *
 * The worker runs `algorithm_hypothesis.runtime` from pythonRuntime.json, which
 * the Python package generates (python -m algorithm_hypothesis.golden), so a
 * function behaves the same here and in the causalab model it compiles to.
 */

import { useSyncExternalStore } from "react";
import type { Variable } from "@/types/algorithmHypothesis";
import type { PythonResolver } from "./engine";
import { errorValue, type Value } from "./primitives";
import runtimeBundle from "./pythonRuntime.json";

const PYODIDE_URL =
    process.env.NEXT_PUBLIC_PYODIDE_URL ?? "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";

/**
 * The worker, a classic script started from a Blob URL so the bundler never
 * touches Pyodide and no static file is needed. It receives the runtime modules
 * once, then one call per message.
 *
 * main → worker  { type: "init", indexURL, package, files: { "runtime.py": source, … } }
 *                { type: "call", request: { id, source, args, template, type } }
 * worker → main  { type: "ready" } | { type: "failed", message }
 *                { type: "result", id, ok, value } | { type: "result", id, ok: false, error }
 */
const WORKER_SOURCE = `
let callBatch = null;
self.onmessage = async (event) => {
    const msg = event.data;
    if (msg.type === "init") {
        try {
            importScripts(msg.indexURL + "pyodide.js");
            const py = await loadPyodide({ indexURL: msg.indexURL });
            const dir = "/algorithm_hypothesis_runtime/" + msg.package;
            py.FS.mkdirTree(dir);
            for (const [name, source] of Object.entries(msg.files)) py.FS.writeFile(dir + "/" + name, source);
            py.runPython("import sys; sys.path.insert(0, '/algorithm_hypothesis_runtime')");
            callBatch = py.runPython("from " + msg.package + ".runtime import call_batch; call_batch");
            self.postMessage({ type: "ready" });
        } catch (err) {
            self.postMessage({ type: "failed", message: String((err && err.message) || err) });
        }
        return;
    }
    if (msg.type === "call") {
        const req = msg.request;
        try {
            const [result] = JSON.parse(callBatch(JSON.stringify([req])));
            self.postMessage({ type: "result", ...result });
        } catch (err) {
            self.postMessage({ type: "result", id: req.id, ok: false, error: String((err && err.message) || err) });
        }
    }
};
`;
/** A call that runs longer than this is stopped; the worker restarts. */
const CALL_TIMEOUT_MS = 3000;
const LOAD_TIMEOUT_MS = 90_000;

export type PythonStatus = "idle" | "loading" | "ready" | "failed";

interface PythonRuntimeState {
    status: PythonStatus;
    /** Changes whenever new results arrive. */
    version: number;
    /** Why Pyodide couldn't start, when status is "failed". */
    message: string | null;
}

interface CallRequest {
    id: string;
    source: string;
    args: Record<string, Value | Value[]>;
    template: string[];
    type: Variable["type"];
}

let state: PythonRuntimeState = { status: "idle", version: 0, message: null };
const listeners = new Set<() => void>();
const results = new Map<string, Value>();
/** Queued and not yet sent, by id. */
const waiting = new Map<string, CallRequest>();
/** Sent and not yet answered, in the order the worker runs them. */
let inFlight: CallRequest[] = [];
let worker: Worker | null = null;
let workerUrl: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let flushScheduled = false;
let notifyScheduled = false;

function setState(patch: Partial<PythonRuntimeState>) {
    state = { ...state, ...patch };
    for (const l of listeners) l();
}

/** Results often arrive in bursts; re-render once per burst. */
function bumpVersion() {
    if (notifyScheduled) return;
    notifyScheduled = true;
    queueMicrotask(() => {
        notifyScheduled = false;
        setState({ version: state.version + 1 });
    });
}

function armTimer(ms: number, onTimeout: () => void) {
    clearTimeout(timer);
    timer = setTimeout(onTimeout, ms);
}

function releaseUrl() {
    if (workerUrl) URL.revokeObjectURL(workerUrl);
    workerUrl = null;
}

function stopWorker() {
    clearTimeout(timer);
    worker?.terminate();
    worker = null;
    releaseUrl();
}

function onCallTimeout() {
    const [stuck, ...rest] = inFlight;
    inFlight = [];
    stopWorker();
    if (stuck)
        results.set(
            stuck.id,
            errorValue(
                `Stopped after ${CALL_TIMEOUT_MS / 1000} s. Does compute loop forever on these arguments?`,
            ),
        );
    for (const r of rest) waiting.set(r.id, r);
    setState({ status: "idle" });
    bumpVersion();
    schedule();
}

function onMessage(event: MessageEvent) {
    const msg = event.data as
        | { type: "ready" }
        | { type: "failed"; message: string }
        | { type: "result"; id: string; ok: boolean; value?: Value; error?: string };
    if (msg.type === "ready") {
        clearTimeout(timer);
        releaseUrl();
        setState({ status: "ready", message: null });
        flush();
        return;
    }
    if (msg.type === "failed") {
        stopWorker();
        setState({ status: "failed", message: msg.message });
        bumpVersion();
        return;
    }
    results.set(msg.id, msg.ok ? (msg.value ?? null) : errorValue(msg.error ?? "Failed."));
    inFlight = inFlight.filter((r) => r.id !== msg.id);
    if (inFlight.length) armTimer(CALL_TIMEOUT_MS, onCallTimeout);
    else clearTimeout(timer);
    bumpVersion();
}

function start() {
    if (worker || typeof Worker === "undefined") return;
    try {
        workerUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
        worker = new Worker(workerUrl);
    } catch (err) {
        setState({ status: "failed", message: String(err) });
        return;
    }
    worker.onmessage = onMessage;
    worker.onerror = (e) => {
        stopWorker();
        setState({ status: "failed", message: e.message || "The Python worker crashed." });
        bumpVersion();
    };
    setState({ status: "loading", message: null });
    armTimer(LOAD_TIMEOUT_MS, () => {
        stopWorker();
        setState({ status: "failed", message: "Pyodide took too long to load." });
        bumpVersion();
    });
    worker.postMessage({
        type: "init",
        indexURL: PYODIDE_URL,
        package: runtimeBundle.package,
        files: runtimeBundle.files,
    });
}

function flush() {
    flushScheduled = false;
    if (!waiting.size || state.status === "failed") return;
    if (!worker) return start();
    if (state.status !== "ready") return;
    for (const req of waiting.values()) {
        inFlight.push(req);
        worker.postMessage({ type: "call", request: req });
    }
    waiting.clear();
    armTimer(CALL_TIMEOUT_MS, onCallTimeout);
}

function schedule() {
    if (flushScheduled) return;
    flushScheduled = true;
    queueMicrotask(flush);
}

/** The engine's resolver for custom Python functions. */
const runPython: PythonResolver = (v, args, template) => {
    if (v.function.kind !== "python") return null;
    const id = JSON.stringify([v.function.source, args, template, v.type]);
    const hit = results.get(id);
    if (hit !== undefined) return hit;
    if (state.status === "failed")
        return errorValue(`Python couldn't start: ${state.message ?? "unknown error"}`);
    if (!waiting.has(id) && !inFlight.some((r) => r.id === id)) {
        waiting.set(id, { id, source: v.function.source, args, template, type: v.type });
        schedule();
    }
    return { kind: "pending" };
};

/** The resolver to evaluate with at a runtime version. A new one each time
 * results arrive, so memoized evaluations that use it run again. */
export function pythonResolver(version: number): PythonResolver {
    void version;
    return (v, args, template) => runPython(v, args, template);
}

/** Try loading Pyodide again after it failed. */
export function retryPython() {
    if (state.status !== "failed") return;
    setState({ status: "idle", message: null });
    bumpVersion();
    schedule();
}

const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
};
const SERVER_STATE: PythonRuntimeState = { status: "idle", version: 0, message: null };

/** The runtime's status; re-renders when results arrive. */
export function usePythonRuntime(): PythonRuntimeState {
    return useSyncExternalStore(
        subscribe,
        () => state,
        () => SERVER_STATE,
    );
}
