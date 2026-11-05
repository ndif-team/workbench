/**
 * Values and built-in primitives for Algorithm Hypothesis.
 *
 * Mirrors the `algorithm_hypothesis` Python package (values.py, primitives.py).
 * Position ID numbers the designated special tokens (such as names) and stores
 * a position ID : token pair; Retrieve also dereferences (match by value).
 * Each primitive has typed, named argument slots (a list pattern means the slot
 * takes several references) and options (plain settings). The Python source of
 * each one lives in primitiveSources.ts. Custom Python functions run in a
 * Pyodide worker (python.ts).
 */

import type { PrimitiveName } from "@/types/algorithmHypothesis";
import { PRIMITIVE_SOURCES } from "./primitiveSources";
import { POSITION, STRING, listOf, pairOf, typeVar, type TypePattern } from "./vartypes";

interface TokenValue {
    kind: "token";
    text: string;
    index: number;
}

interface PairValue {
    kind: "pair";
    key: Value;
    value: Value;
}

interface DistributionValue {
    kind: "distribution";
    items: { label: string; p: number }[];
}

/** A custom Python function's value that the worker hasn't returned yet. */
interface PendingValue {
    kind: "pending";
}

/** A custom Python function that failed, or a value that depends on one. */
interface ErrorValue {
    kind: "error";
    message: string;
}

export type Value =
    | null
    | number
    | string
    | boolean
    | TokenValue
    | PairValue
    | DistributionValue
    | PendingValue
    | ErrorValue;

export const tokenValue = (text: string, index: number): TokenValue => ({
    kind: "token",
    text,
    index,
});

function isObj(
    v: Value,
): v is TokenValue | PairValue | DistributionValue | PendingValue | ErrorValue {
    return v !== null && typeof v === "object";
}

const isPair = (v: Value): v is PairValue => isObj(v) && v.kind === "pair";

function topItem(d: DistributionValue) {
    return d.items.reduce((a, b) => (b.p > a.p ? b : a));
}

/** The top label of a distribution, or tied top labels joined with " / ". */
function distributionLabel(d: DistributionValue): string {
    const best = topItem(d).p;
    return d.items
        .filter((x) => best - x.p < 0.01)
        .map((x) => x.label)
        .join(" / ");
}

/** Identity used for equality and "did this value change" checks. */
export function keyOf(v: Value): string | null {
    if (v === null || v === undefined) return null;
    if (isObj(v)) {
        if (v.kind === "token") return "s:" + v.text.trim();
        if (v.kind === "pair") return `pair(${keyOf(v.key)},${keyOf(v.value)})`;
        if (v.kind === "distribution")
            return "d:" + v.items.map((x) => `${x.label}=${Math.round(x.p * 100)}`).join(",");
        if (v.kind === "error") return "error";
        return "pending";
    }
    if (typeof v === "string") return "s:" + v.trim();
    if (typeof v === "boolean") return "b:" + v;
    return "n:" + v;
}

/** Python's `a == b` for these values. Nothing equals ∅. */
const eq = (a: Value, b: Value) => a !== null && b !== null && keyOf(a) === keyOf(b);

/** How a value is shown in a grid cell. */
export function show(v: Value): string {
    if (v === null || v === undefined) return "∅";
    if (isObj(v)) {
        if (v.kind === "token") return v.text.trim();
        if (v.kind === "pair") {
            const side = (x: Value) => (isPair(x) ? `(${show(x)})` : show(x));
            return `${side(v.key)}:${side(v.value)}`;
        }
        if (v.kind === "distribution") return distributionLabel(v);
        if (v.kind === "error") return "error";
        return "…";
    }
    return String(v);
}

export function isDistribution(v: Value): v is DistributionValue {
    return isObj(v) && v.kind === "distribution";
}

export function isPending(v: Value): v is PendingValue {
    return isObj(v) && v.kind === "pending";
}

export function isError(v: Value): v is ErrorValue {
    return isObj(v) && v.kind === "error";
}

export const errorValue = (message: string): ErrorValue => ({ kind: "error", message });

// ------------------------------------------------------------------ registry

interface SlotSpec {
    name: string;
    /** A list pattern means the slot takes several references. */
    type: TypePattern;
}

interface OptionSpec {
    name: string;
    label: string;
    default: string | number;
    choices?: string[];
}

interface PrimitiveSpec {
    label: string;
    slots: SlotSpec[];
    /** null: set by the "type" option (Constant). */
    returns: TypePattern | null;
    options: OptionSpec[];
    /** Slots and return type under other option values, if they differ. */
    retype?: (
        options: Record<string, string | number>,
    ) => { slots: SlotSpec[]; returns: TypePattern | null } | null;
    run: (args: Record<string, Value | Value[]>, options: Record<string, string | number>) => Value;
}

export const isListSlot = (s: { type: TypePattern }) => s.type.kind === "list";

const one = (args: Record<string, Value | Value[]>, name: string): Value => {
    const v = args[name];
    return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
};

const many = (args: Record<string, Value | Value[]>, name: string): Value[] => {
    const v = args[name];
    return Array.isArray(v) ? v : v === undefined ? [] : [v];
};

const num = (v: string | number | undefined, fallback: number) => {
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : fallback;
};

const K = typeVar("K");
const V = typeVar("V");
const T = typeVar("T");

/** Special tokens compare without a possessive: "Tim's" is Tim. */
const specialName = (v: Value) => (keyOf(v) ?? "").split("'")[0];

export const PRIMITIVES: Record<PrimitiveName, PrimitiveSpec> = {
    position_id: {
        label: "Position ID",
        slots: [
            { name: "token", type: STRING },
            { name: "specials", type: listOf(STRING) },
        ],
        returns: pairOf(POSITION, STRING),
        options: [],
        run(args) {
            const token = one(args, "token");
            const ids = new Map<string, number>();
            for (const t of many(args, "specials"))
                if (t !== null && !ids.has(specialName(t))) ids.set(specialName(t), ids.size + 1);
            const id = token === null ? undefined : ids.get(specialName(token));
            return id === undefined ? null : { kind: "pair", key: id, value: token };
        },
    },
    copy: {
        label: "Copy",
        slots: [{ name: "x", type: T }],
        returns: T,
        options: [],
        run: (args) => one(args, "x"),
    },
    pair: {
        label: "Pair",
        slots: [
            { name: "key", type: K },
            { name: "value", type: V },
        ],
        returns: pairOf(K, V),
        options: [],
        run: (args) => ({ kind: "pair", key: one(args, "key"), value: one(args, "value") }),
    },
    retrieve: {
        label: "Retrieve",
        slots: [
            { name: "key", type: K },
            { name: "pairs", type: listOf(pairOf(K, V)) },
        ],
        returns: V,
        options: [{ name: "match", label: "Match by", default: "key", choices: ["key", "value"] }],
        // Matching on values compares the key with each pair's value.
        retype: (opts) =>
            String(opts.match ?? "key") === "value"
                ? {
                      slots: [
                          { name: "key", type: V },
                          { name: "pairs", type: listOf(pairOf(K, V)) },
                      ],
                      returns: V,
                  }
                : null,
        run(args, opts) {
            const key = one(args, "key");
            const byValue = String(opts.match ?? "key") === "value";
            for (const p of many(args, "pairs"))
                if (isPair(p) && eq(byValue ? p.value : p.key, key)) return p.value;
            return null;
        },
    },
    index: {
        label: "Index",
        slots: [
            { name: "i", type: POSITION },
            { name: "values", type: listOf(V) },
        ],
        returns: V,
        options: [],
        run(args) {
            const i = one(args, "i");
            const values = many(args, "values");
            return typeof i === "number" && Number.isInteger(i) && i >= 1 && i <= values.length
                ? (values[i - 1] ?? null)
                : null;
        },
    },
    key_of: {
        label: "KeyOf",
        slots: [{ name: "pair", type: pairOf(K, V) }],
        returns: K,
        options: [],
        run: (args) => {
            const p = one(args, "pair");
            return isPair(p) ? p.key : null;
        },
    },
    value_of: {
        label: "ValueOf",
        slots: [{ name: "pair", type: pairOf(K, V) }],
        returns: V,
        options: [],
        run: (args) => {
            const p = one(args, "pair");
            return isPair(p) ? p.value : null;
        },
    },
    mixture: {
        label: "Mixture",
        slots: [{ name: "answers", type: listOf(V) }],
        returns: STRING,
        options: [{ name: "weights", label: "Weights", default: "" }],
        run(args, opts) {
            const answers = many(args, "answers");
            const given = String(opts.weights ?? "")
                .split(",")
                .filter((x) => x.trim());
            const bad = given.find((x) => !Number.isFinite(Number(x)));
            if (bad !== undefined) return errorValue(`Weight “${bad.trim()}” isn't a number.`);
            const w = answers.map((_, i) => (i < given.length ? Number(given[i]) : 1));
            const total = w.reduce((a, b) => a + b, 0) || 1;
            const p = new Map<string, number>();
            answers.forEach((a, i) => p.set(show(a), (p.get(show(a)) ?? 0) + w[i] / total));
            return {
                kind: "distribution",
                items: [...p].map(([label, x]) => ({ label, p: x })),
            };
        },
    },
    constant: {
        label: "Constant",
        slots: [],
        returns: null,
        options: [
            { name: "value", label: "Value", default: "" },
            {
                name: "type",
                label: "Type",
                default: "string",
                choices: ["string", "int", "position"],
            },
        ],
        run(_args, opts) {
            const v = String(opts.value ?? "");
            if (v === "") return null;
            if (String(opts.type ?? "string") === "string") return v;
            const n = Number(v);
            return Number.isInteger(n) ? n : null;
        },
    },
};

export const PRIMITIVE_NAMES = Object.keys(PRIMITIVES) as PrimitiveName[];

export function defaultOptions(name: PrimitiveName): Record<string, string | number> {
    return Object.fromEntries(PRIMITIVES[name].options.map((o) => [o.name, o.default]));
}

/** A primitive's slots and return type for these option values. */
export function signatureOf(
    name: PrimitiveName,
    options: Record<string, string | number> = {},
): { slots: SlotSpec[]; returns: TypePattern | null } {
    const p = PRIMITIVES[name];
    return p.retype?.(options) ?? { slots: p.slots, returns: p.returns };
}

/** A primitive's Python source, with the given option values as its defaults. */
export function primitiveSource(
    name: PrimitiveName,
    options: Record<string, string | number> = {},
): string {
    let src = PRIMITIVE_SOURCES[name];
    for (const o of PRIMITIVES[name].options) {
        const value = options[o.name] ?? o.default;
        let literal: string;
        if (typeof o.default === "number") {
            const n = Number(value);
            literal = Number.isFinite(n)
                ? Number.isInteger(n)
                    ? `${n}.0`
                    : String(n)
                : String(o.default);
        } else literal = JSON.stringify(String(value));
        // `name: type = default` in the signature.
        src = src.replace(
            new RegExp(`(\\b${o.name}\\s*:\\s*[A-Za-z_][\\w.]*\\s*=\\s*)("[^"]*"|[-\\d.]+)`),
            (_m, head: string) => head + literal,
        );
    }
    return src;
}

/** A primitive's source as a custom function: the same code, renamed `compute`. */
export function primitiveAsPython(
    name: PrimitiveName,
    options: Record<string, string | number> = {},
): string {
    return primitiveSource(name, options).replace(
        new RegExp(`^def ${name}\\(`, "m"),
        "def compute(",
    );
}
