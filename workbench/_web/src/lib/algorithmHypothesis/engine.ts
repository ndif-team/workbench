/**
 * Algorithm Hypothesis engine: placement, residual spans, evaluation,
 * validation, moves and interchange interventions.
 *
 * Semantics (design doc §4.3): a value is born in its cell and carried up its
 * token's column until just below the last variable that reads it (its span).
 * An interchange intervention on cell (l, t) replaces every value whose span
 * covers (l, t); readers above layer l get the source's value. Tokens are born
 * on the embedding row (layer -1) and carried the same way. Only values with the
 * same name are swapped.
 *
 * Mirrors the `algorithm_hypothesis` Python package; the golden tests in
 * __tests__ keep the two in agreement.
 */

import {
    ALGORITHM_SCHEMA_ID,
    type AlgorithmDefinition,
    type Arg,
    type Cell,
    type Ref,
    type VarType,
    type Variable,
} from "@/types/algorithmHypothesis";
import {
    PRIMITIVES,
    errorValue,
    isError,
    isListSlot,
    isPending,
    keyOf,
    signatureOf,
    tokenValue,
    type Value,
} from "./primitives";
import {
    BASIC_KINDS,
    STRING,
    describeType,
    isVarType,
    substitute,
    unify,
    type Subst,
    type TypePattern,
} from "./vartypes";

const EMB = -1;

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED = new Set(["tok", "raw_input", "raw_output", "render", "TEMPLATE"]);
const PY_KEYWORDS = new Set(
    "False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(
        " ",
    ),
);

// ------------------------------------------------------------------ graph

export const refKey = (r: Ref): string => ("variable" in r ? `v:${r.variable}` : `t:${r.token}`);
export const varKey = (id: string) => `v:${id}`;
const tokKey = (t: number) => `t:${t}`;

export function refsOf(v: Variable): Ref[] {
    return v.args.flatMap((a) => a.refs);
}

export function byId(def: AlgorithmDefinition): Map<string, Variable> {
    return new Map(def.variables.map((v) => [v.id, v]));
}

/** Node key → layers of the variables that read it. */
export function readers(def: AlgorithmDefinition): Map<string, number[]> {
    const out = new Map<string, number[]>();
    for (const v of def.variables) {
        for (const r of refsOf(v)) {
            const k = refKey(r);
            const list = out.get(k);
            if (list) list.push(v.cell.layer);
            else out.set(k, [v.cell.layer]);
        }
    }
    return out;
}

function birthOf(vars: Map<string, Variable>, key: string): number {
    if (key.startsWith("t:")) return EMB;
    return vars.get(key.slice(2))?.cell.layer ?? EMB;
}

function columnOf(vars: Map<string, Variable>, key: string): number {
    if (key.startsWith("t:")) return Number(key.slice(2));
    return vars.get(key.slice(2))?.cell.token ?? -1;
}

/** Highest layer at which the value still sits in the residual stream. */
export function spanEnd(
    def: AlgorithmDefinition,
    key: string,
    rd: Map<string, number[]> = readers(def),
    vars: Map<string, Variable> = byId(def),
): number {
    const b = birthOf(vars, key);
    const layers = rd.get(key);
    if (!layers || !layers.length) return b;
    return Math.max(b, Math.max(...layers) - 1);
}

/** Keys of every value living in cell (layer, token): variables in definition
 * order, then the token itself. */
export function nodesAt(def: AlgorithmDefinition, layer: number, token: number): string[] {
    const rd = readers(def);
    const vars = byId(def);
    const out: string[] = [];
    for (const v of def.variables) {
        const k = varKey(v.id);
        if (v.cell.token === token && v.cell.layer <= layer && layer <= spanEnd(def, k, rd, vars))
            out.push(k);
    }
    const tk = tokKey(token);
    if (rd.has(tk) && layer <= spanEnd(def, tk, rd, vars)) out.push(tk);
    return out;
}

/** Ids of every variable that reads `id`. */
export function readersOf(def: AlgorithmDefinition, id: string): Variable[] {
    return def.variables.filter((v) => refsOf(v).some((r) => "variable" in r && r.variable === id));
}

// ------------------------------------------------------------- validation

/** Why `ref` can't be an argument of a variable at `cell`, or null. */
export function refProblem(def: AlgorithmDefinition, cell: Cell, ref: Ref): string | null {
    if (!("variable" in ref)) {
        if (ref.token < 0) return "Unknown token.";
        if (ref.token > cell.token) return "Tokens to the right are not visible yet (causal mask).";
        return null;
    }
    const v = byId(def).get(ref.variable);
    if (!v) return "Unknown variable.";
    if (v.cell.layer >= cell.layer)
        return `${v.name} is at L${v.cell.layer}; arguments must come from a lower layer.`;
    if (v.cell.token > cell.token) return `${v.name} sits to the right of this cell (causal mask).`;
    return null;
}

export function isValidName(name: string): boolean {
    return (
        IDENT.test(name) && !PY_KEYWORDS.has(name) && !name.includes("__") && !RESERVED.has(name)
    );
}

/** Whether the arguments fill the function's slots. */
export function slotProblems(v: Pick<Variable, "function" | "args" | "type">): string[] {
    const out: string[] = [];
    if (v.function.kind === "python") {
        const names = v.args.map((a) => a.name);
        for (const n of names)
            if (!IDENT.test(n) || PY_KEYWORDS.has(n))
                out.push(`Argument name “${n}” is not a valid Python identifier.`);
        if (new Set(names).size !== names.length) out.push("Argument names must be unique.");
        if (!isVarType(v.type)) out.push("Choose the type this function returns.");
        return out;
    }
    const prim = PRIMITIVES[v.function.name];
    if (!prim) return [`Unknown primitive “${v.function.name}”.`];
    const { slots } = signatureOf(v.function.name, v.function.options);
    const byName = new Map(v.args.map((a) => [a.name, a]));
    for (const slot of slots) {
        const refs = byName.get(slot.name)?.refs ?? [];
        if (isListSlot(slot) && !refs.length)
            out.push(`${prim.label}: add at least one reference to ${slot.name}.`);
        if (!isListSlot(slot) && refs.length !== 1)
            out.push(`${prim.label}: ${slot.name} takes exactly one reference.`);
    }
    for (const name of byName.keys())
        if (!slots.some((s) => s.name === name))
            out.push(`${prim.label} has no argument named “${name}”.`);
    if (
        v.function.name === "constant" &&
        String(v.function.options.type ?? "string") !== "string"
    ) {
        const value = String(v.function.options.value ?? "");
        if (value !== "" && !Number.isInteger(Number(value)))
            out.push("Constant: an int or position value must be a whole number.");
    }
    return out;
}

// ------------------------------------------------------------------ types

/** The type a slot expects for each of its references (a list slot's element). */
const slotElement = (pattern: TypePattern): TypePattern =>
    pattern.kind === "list" ? pattern.of : pattern;

interface VariableTypes {
    /** The variable's type, or null while it can't be determined. */
    type: VarType | null;
    /** Type variables bound by the arguments so far (K, V, T). */
    subst: Subst;
    problems: string[];
}

/** Infer one variable's type from its function and its arguments' types. */
export function inferVariable(
    v: Pick<Variable, "function" | "args" | "type">,
    typeOfRef: (r: Ref) => VarType | null,
    labelOfRef: (r: Ref) => string,
): VariableTypes {
    if (v.function.kind === "python")
        return { type: isVarType(v.type) ? v.type : null, subst: {}, problems: [] };
    const prim = PRIMITIVES[v.function.name];
    if (!prim) return { type: null, subst: {}, problems: [] };
    const { slots, returns } = signatureOf(v.function.name, v.function.options);
    if (returns === null) {
        const kind = String(v.function.options.type ?? "string");
        const type = (BASIC_KINDS as readonly string[]).includes(kind)
            ? ({ kind } as VarType)
            : null;
        return { type, subst: {}, problems: [] };
    }
    const subst: Subst = {};
    const problems: string[] = [];
    const byName = new Map(v.args.map((a) => [a.name, a]));
    for (const slot of slots) {
        const element = slotElement(slot.type);
        for (const r of byName.get(slot.name)?.refs ?? []) {
            const t = typeOfRef(r);
            if (!t) continue;
            const expected = describeType(element, subst);
            if (!unify(element, t, subst))
                problems.push(
                    `${slot.name}: ${labelOfRef(r)} is ${describeType(t)}, but this argument needs ${expected}.`,
                );
        }
    }
    return { type: substitute(returns, subst), subst, problems };
}

/** Every variable's type, and type problems per variable. */
export function inferTypes(def: AlgorithmDefinition): {
    types: Map<string, VarType | null>;
    problems: Map<string, string[]>;
} {
    const vars = byId(def);
    const types = new Map<string, VarType | null>();
    const problems = new Map<string, string[]>();
    const order = [...def.variables].sort(
        (a, b) => a.cell.layer - b.cell.layer || a.cell.token - b.cell.token,
    );
    for (const v of order) {
        const r = inferVariable(
            v,
            (ref) => ("variable" in ref ? (types.get(ref.variable) ?? null) : STRING),
            (ref) =>
                "variable" in ref ? (vars.get(ref.variable)?.name ?? "?") : `token ${ref.token}`,
        );
        types.set(v.id, r.type);
        if (r.problems.length) problems.set(v.id, r.problems);
    }
    return { types, problems };
}

/** The definition with every primitive variable's stored type re-inferred. */
export function withInferredTypes(def: AlgorithmDefinition): AlgorithmDefinition {
    const { types } = inferTypes(def);
    return {
        ...def,
        variables: def.variables.map((v) =>
            v.function.kind === "python" ? v : { ...v, type: types.get(v.id) ?? null },
        ),
    };
}

const pyNumber = (v: string | number | undefined, fallback: number) => {
    const n = Number(v ?? fallback);
    const x = Number.isFinite(n) ? n : fallback;
    return Number.isInteger(x) ? `${x}.0` : String(x);
};

/** Python sources of primitives that schema v3 removed, and of v3's Mixture
 * (the paper's Eq. 2, which v4 replaced), as custom functions. */
const LEGACY_SOURCES: Record<string, (options: Record<string, string | number>) => string> = {
    position_id: (o) =>
        `def compute(token, *, by=${JSON.stringify(String(o.by ?? "group"))}, delimiter=${JSON.stringify(String(o.delimiter ?? ","))}, template=()):\n    """Where the token sits in the template: its entity group (1 + the\n    delimiters before it) or its index. (The position ID of schema v2.)"""\n    if by == "token":\n        return token.index\n    return 1 + sum(1 for t in template[: token.index] if t.strip() == delimiter)\n`,
    lookup: () =>
        `def compute(key, keys, values):\n    """The value next to the first key equal to \`key\`. (Lookup, from schema v2.)"""\n    for k, v in zip(keys, values):\n        if key is not None and k == key:\n            return v\n    return None\n`,
    dereference: () =>
        `def compute(pointer, tokens):\n    """The token the pointer names, if it is in context. (Dereference, from schema v2.)"""\n    for t in tokens:\n        if pointer is not None and t == pointer:\n            return t\n    return None\n`,
    mixture: (o) =>
        `def compute(P, L, R, bindings, *, w_pos=${pyNumber(o.w_pos, 3)}, sigma=${pyNumber(o.sigma, 0.7)}, w_lex=${pyNumber(o.w_lex, 2.6)}, w_ref=${pyNumber(o.w_ref, 2.6)}):\n    """Eq. 2 of Gur-Arieh et al.: a Gaussian around group P, plus a bump at\n    the group whose key is L and one at the group whose value is R. (Mixture,\n    from schema v3.)"""\n    scores = []\n    for i, b in enumerate(bindings, start=1):\n        b = b if isinstance(b, Pair) else Pair(None, None)\n        s = w_pos * math.exp(-((i - P) ** 2) / (2 * sigma**2)) if isinstance(P, int) else 0.0\n        s += w_lex if L is not None and b.key == L else 0.0\n        s += w_ref if R is not None and b.value == R else 0.0\n        scores.append(s)\n    top = max(scores, default=0.0)\n    weights = [math.exp(s - top) for s in scores]\n    total = sum(weights) or 1.0\n    return Distribution(tuple((show(b.value) if isinstance(b, Pair) else "∅", w / total) for b, w in zip(bindings, weights)))\n`,
};

/** Read a stored definition, upgrading older schemas to v4. v1 had glyphs and a
 * `pointer` primitive; v2 had Token identity (now Copy), Lookup and
 * Dereference (now Retrieve), and a Position ID that returned a bare number;
 * up to v3, Mixture was the paper's Eq. 2 over P, L, R and the bindings (now a
 * linear combination of answers). Removed primitives become custom Python
 * functions with their old source, so an old algorithm computes what it did. */
export function upgradeDefinition(raw: unknown): AlgorithmDefinition {
    const def = raw as AlgorithmDefinition & { schema: string };
    if (def.schema === ALGORITHM_SCHEMA_ID) return def;
    const version = Number(/v(\d+)$/.exec(def.schema ?? "")?.[1] ?? 1);
    const variables = (def.variables ?? []).map((old) => {
        const { glyph: _glyph, ...rest } = old as Variable & { glyph?: string };
        void _glyph;
        const fn = rest.function as
            | Variable["function"]
            | { kind: "primitive"; name: string; options: Record<string, string | number> };
        const v = { ...rest, type: (rest as Partial<Variable>).type ?? null } as Variable;
        if (fn.kind !== "primitive") return v;
        if (fn.name === "pointer" || fn.name === "identity")
            return {
                ...v,
                function: { kind: "primitive" as const, name: "copy" as const, options: {} },
                args: v.args.map((a) => ({ ...a, name: "x" })),
            };
        // v3 kept Position ID as it is now; only Mixture changed in v4.
        const legacy = version < 3 || fn.name === "mixture" ? LEGACY_SOURCES[fn.name] : undefined;
        if (legacy)
            return {
                ...v,
                type:
                    v.type ??
                    (fn.name === "position_id"
                        ? { kind: "position" as const }
                        : fn.name === "mixture"
                          ? { kind: "string" as const }
                          : null),
                function: { kind: "python" as const, source: legacy(fn.options ?? {}) },
            };
        return v;
    });
    return withInferredTypes({ ...def, schema: ALGORITHM_SCHEMA_ID, variables });
}

/** An algorithm from a JSON file as Download writes it, in any schema version.
 * Throws an Error that says what is wrong with the file. */
export function parseAlgorithmFile(text: string): AlgorithmDefinition {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        throw new Error("It isn't valid JSON.");
    }
    const def = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<
        string,
        unknown
    >;
    const schema = typeof def.schema === "string" ? def.schema : "";
    const version = /^algorithm-hypothesis\/v(\d+)$/.exec(schema);
    if (!version) throw new Error("It isn't an algorithm saved with Download.");
    if (Number(version[1]) > 4)
        throw new Error(`It uses ${schema}, which is newer than this version reads.`);
    const grid = (def.grid ?? {}) as Partial<AlgorithmDefinition["grid"]>;
    if (
        (grid.kind !== "abstract" && grid.kind !== "model") ||
        !Number.isInteger(grid.layers) ||
        grid.layers! < 1 ||
        (grid.kind === "model" && typeof grid.model !== "string")
    )
        throw new Error("Its grid is missing or malformed.");
    if (!Array.isArray(def.variables)) throw new Error("It has no list of variables.");
    def.variables.forEach((x: Partial<Variable> | null, i) => {
        const ok =
            !!x &&
            typeof x.id === "string" &&
            typeof x.name === "string" &&
            Number.isInteger(x.cell?.layer) &&
            Number.isInteger(x.cell?.token) &&
            typeof x.function?.kind === "string" &&
            Array.isArray(x.args) &&
            x.args.every((a) => typeof a?.name === "string" && Array.isArray(a.refs));
        if (!ok) throw new Error(`Variable ${i + 1} is malformed.`);
    });
    return upgradeDefinition({
        ...def,
        name: typeof def.name === "string" && def.name.trim() ? def.name : "Imported algorithm",
        description: typeof def.description === "string" ? def.description : "",
        template: typeof def.template === "string" ? def.template : "",
        output: typeof def.output === "string" ? def.output : null,
    });
}

/** Problems with one variable where it stands. */
function variableProblems(
    def: AlgorithmDefinition,
    v: Variable,
    nTokens: number,
    typeProblems: string[],
): string[] {
    const out: string[] = [];
    if (!isValidName(v.name))
        out.push(
            `“${v.name}” is not a valid name. Use letters, digits and single underscores; tok, raw_input, raw_output, render and TEMPLATE are reserved.`,
        );
    if (def.variables.some((o) => o.id !== v.id && o.name === v.name))
        out.push(`Another variable is called ${v.name}.`);
    if (v.cell.layer < 0 || v.cell.layer >= def.grid.layers)
        out.push(`L${v.cell.layer} is outside the grid's ${def.grid.layers} layers.`);
    if (v.cell.token < 0 || v.cell.token >= nTokens)
        out.push(`Token ${v.cell.token} is outside the prompt's ${nTokens} tokens.`);
    for (const r of refsOf(v)) {
        const msg = refProblem(def, v.cell, r);
        if (msg) out.push(msg);
    }
    out.push(...slotProblems(v), ...typeProblems);
    return out;
}

/** Everything that stops the algorithm from running, with the variable it's about. */
export function problems(
    def: AlgorithmDefinition,
    nTokens: number,
): { variableId: string | null; message: string }[] {
    const out: { variableId: string | null; message: string }[] = [];
    const typeInfo = inferTypes(def);
    for (const v of def.variables)
        for (const m of variableProblems(def, v, nTokens, typeInfo.problems.get(v.id) ?? []))
            out.push({ variableId: v.id, message: m });
    const outVar = def.output ? byId(def).get(def.output) : undefined;
    if (!outVar) out.push({ variableId: null, message: "No output variable yet." });
    else {
        const last = { layer: def.grid.layers - 1, token: nTokens - 1 };
        if (outVar.cell.layer !== last.layer || outVar.cell.token !== last.token)
            out.push({
                variableId: outVar.id,
                message: `The output must sit at L${last.layer}, token ${last.token} (the last layer and token).`,
            });
    }
    return out;
}

/** Why variable `id` can't move to `cell`, or null. Moving keeps its definition. */
export function moveProblem(
    def: AlgorithmDefinition,
    id: string,
    cell: Cell,
    nTokens: number,
): string | null {
    const v = byId(def).get(id);
    if (!v) return "Unknown variable.";
    if (cell.layer < 0 || cell.layer >= def.grid.layers) return "That layer is outside the grid.";
    if (cell.token < 0 || cell.token >= nTokens) return "That token is outside the prompt.";
    for (const r of refsOf(v)) {
        const msg = refProblem(def, cell, r);
        if (msg) return `${v.name} reads it: ${msg}`;
    }
    for (const r of readersOf(def, id)) {
        if (r.cell.layer <= cell.layer)
            return `${r.name} reads ${v.name} at L${r.cell.layer}, so ${v.name} must stay below L${r.cell.layer}.`;
        if (r.cell.token < cell.token)
            return `${r.name} reads ${v.name} at token ${r.cell.token}, so ${v.name} can't move to its right.`;
    }
    if (def.output === id && (cell.layer !== def.grid.layers - 1 || cell.token !== nTokens - 1))
        return "The output must stay at the last layer and last token.";
    return null;
}

// ------------------------------------------------------------- evaluation

/** Values swapped in at one cell: node key → donor value. */
interface Intervention {
    layer: number;
    token: number;
    values: Record<string, Value>;
}

export interface Evaluation {
    tokens: string[];
    values: Record<string, Value>;
    interventions: Intervention[];
}

/** Runs a custom Python function on its arguments' values: the value, pending
 * while it runs, or an error. Without one, Python variables stay pending. */
export type PythonResolver = (
    v: Variable,
    args: Record<string, Value | Value[]>,
    templateTokens: string[],
) => Value;

export interface EvaluateOptions {
    /** Tokens of the algorithm's template, passed to a custom Python function
     * that has a `template` parameter. */
    templateTokens?: string[];
    python?: PythonResolver;
}

function readArgs(
    v: Variable,
    read: (key: string, readerLayer: number) => Value,
): Record<string, Value | Value[]> {
    const out: Record<string, Value | Value[]> = {};
    const slots =
        v.function.kind === "primitive" && PRIMITIVES[v.function.name]
            ? signatureOf(v.function.name, v.function.options).slots
            : undefined;
    for (const a of v.args) {
        const vals = a.refs.map((r) => read(refKey(r), v.cell.layer));
        const slot = slots?.find((s) => s.name === a.name);
        const many = slot ? isListSlot(slot) : vals.length !== 1;
        out[a.name] = many ? vals : (vals[0] ?? null);
    }
    return out;
}

export function evaluate(
    def: AlgorithmDefinition,
    tokens: string[],
    options: EvaluateOptions & { interventions?: Intervention[] } = {},
): Evaluation {
    const interventions = options.interventions ?? [];
    const ctx = { templateTokens: options.templateTokens ?? tokens };
    const vars = byId(def);
    const values: Record<string, Value> = {};

    const read = (key: string, readerLayer: number): Value => {
        const birth = birthOf(vars, key);
        const col = columnOf(vars, key);
        let best: Intervention | null = null;
        for (const iv of interventions) {
            if (
                iv.token === col &&
                iv.layer >= birth &&
                iv.layer < readerLayer &&
                key in iv.values
            ) {
                if (!best || iv.layer > best.layer) best = iv;
            }
        }
        if (best) return best.values[key];
        if (key.startsWith("t:")) {
            const t = Number(key.slice(2));
            return t >= 0 && t < tokens.length ? tokenValue(tokens[t], t) : null;
        }
        return values[key.slice(2)] ?? null;
    };

    const order = [...def.variables].sort(
        (a, b) => a.cell.layer - b.cell.layer || a.cell.token - b.cell.token,
    );
    // Variable id → name of the Python variable whose failure it inherits.
    const failedBy: Record<string, string> = {};
    for (const v of order) {
        const args = readArgs(v, read);
        const flat = Object.values(args).flatMap((x) => (Array.isArray(x) ? x : [x]));
        if (flat.some(isError)) {
            const ref = refsOf(v).find((r) => isError(read(refKey(r), v.cell.layer)));
            const from =
                (ref && "variable" in ref
                    ? (failedBy[ref.variable] ?? vars.get(ref.variable)?.name)
                    : undefined) ?? "a Python function";
            failedBy[v.id] = from;
            values[v.id] = errorValue(`Depends on ${from}, which failed.`);
            continue;
        }
        if (flat.some(isPending)) {
            values[v.id] = { kind: "pending" };
            continue;
        }
        if (v.function.kind === "python") {
            values[v.id] =
                options.python && !slotProblems(v).length
                    ? options.python(v, args, ctx.templateTokens)
                    : { kind: "pending" };
            if (isError(values[v.id])) failedBy[v.id] = v.name;
            continue;
        }
        const prim = PRIMITIVES[v.function.name];
        if (!prim || slotProblems(v).length) {
            values[v.id] = null;
            continue;
        }
        try {
            values[v.id] = prim.run(args, v.function.options ?? {});
        } catch {
            values[v.id] = null;
        }
    }
    return { tokens, values, interventions };
}

/** A value as it sits in the residual stream at `layer`, and whether it came
 * from an intervention. `key` is a node key (varKey(id) or a token's "t:i"). */
export function valueAt(
    def: AlgorithmDefinition,
    ev: Evaluation,
    key: string,
    layer: number,
): { value: Value; intervened: boolean } {
    const vars = byId(def);
    const birth = birthOf(vars, key);
    const col = columnOf(vars, key);
    let best: Intervention | null = null;
    for (const iv of ev.interventions) {
        if (iv.token === col && iv.layer >= birth && iv.layer <= layer && key in iv.values) {
            if (!best || iv.layer > best.layer) best = iv;
        }
    }
    if (best) return { value: best.values[key], intervened: true };
    if (key.startsWith("t:")) {
        const t = Number(key.slice(2));
        return {
            value: t >= 0 && t < ev.tokens.length ? tokenValue(ev.tokens[t], t) : null,
            intervened: false,
        };
    }
    return { value: ev.values[key.slice(2)] ?? null, intervened: false };
}

/** The output as it sits at the top of the grid, so an intervention on the
 * output cell itself counts. */
export function outputOf(def: AlgorithmDefinition, ev: Evaluation): Value {
    if (!def.output) return null;
    return valueAt(def, ev, varKey(def.output), def.grid.layers - 1).value;
}

// --------------------------------------------------------- interventions

interface InterventionResult {
    ok: boolean;
    reason: string | null;
    /** Nothing lives in one of the cells. */
    empty: boolean;
    /** Node keys whose source values were swapped in. */
    swapped: string[];
    /** The source run; null if nothing was swapped. */
    source: Evaluation | null;
    target: Evaluation;
    counterfactual: Evaluation | null;
    /** The counterfactual output, or the target's own output if not ok. */
    output: Value;
}

/** Swap the values in `sourceCell` of the source run into `targetCell` of the
 * target run. Only values with the same name are swapped. */
export function interchangeIntervention(
    def: AlgorithmDefinition,
    sourceTokens: string[],
    targetTokens: string[],
    sourceCell: Cell,
    targetCell: Cell,
    options: EvaluateOptions = {},
): InterventionResult {
    return intervene(def, sourceTokens, targetTokens, sourceCell, targetCell, options);
}

/** interchangeIntervention, reusing source and target runs when given (sweeps
 * run hundreds of interventions on the same pair of inputs). */
function intervene(
    def: AlgorithmDefinition,
    sourceTokens: string[],
    targetTokens: string[],
    sourceCell: Cell,
    targetCell: Cell,
    options: EvaluateOptions,
    runs: { source?: Evaluation; target?: Evaluation } = {},
): InterventionResult {
    const target = runs.target ?? evaluate(def, targetTokens, options);
    const sNodes = nodesAt(def, sourceCell.layer, sourceCell.token);
    const tNodes = nodesAt(def, targetCell.layer, targetCell.token);
    const base = {
        source: null,
        target,
        counterfactual: null,
        output: outputOf(def, target),
        swapped: [],
    };
    if (!sNodes.length || !tNodes.length) {
        const which = !sNodes.length ? "source" : "target";
        return { ...base, ok: false, empty: true, reason: `Nothing lives in that ${which} cell.` };
    }
    const shared = tNodes.filter((k) => sNodes.includes(k));
    if (!shared.length) {
        return {
            ...base,
            ok: false,
            empty: false,
            reason: "The two cells share no variables. Interventions only swap variables with the same name.",
        };
    }
    const source = runs.source ?? evaluate(def, sourceTokens, options);
    const values: Record<string, Value> = {};
    for (const k of shared) values[k] = valueAt(def, source, k, sourceCell.layer).value;
    const counterfactual = evaluate(def, targetTokens, {
        ...options,
        interventions: [{ layer: targetCell.layer, token: targetCell.token, values }],
    });
    return {
        ok: true,
        reason: null,
        empty: false,
        swapped: shared,
        source,
        target,
        counterfactual,
        output: outputOf(def, counterfactual),
    };
}

export type SweepStatus = "ok" | "empty" | "unpaired";

export interface SweepRow {
    layer: number;
    output: Value;
    status: SweepStatus;
}

/** Intervene on one token at every layer, embedding row included. */
export function tokenSweep(
    def: AlgorithmDefinition,
    sourceTokens: string[],
    targetTokens: string[],
    sourceToken: number,
    targetToken: number,
    options: EvaluateOptions = {},
    runs: { source?: Evaluation; target?: Evaluation } = {},
): SweepRow[] {
    const source = runs.source ?? evaluate(def, sourceTokens, options);
    const target = runs.target ?? evaluate(def, targetTokens, options);
    const rows: SweepRow[] = [];
    for (let layer = EMB; layer < def.grid.layers; layer++) {
        const r = intervene(
            def,
            sourceTokens,
            targetTokens,
            { layer, token: sourceToken },
            { layer, token: targetToken },
            options,
            { source, target },
        );
        rows.push({
            layer,
            output: r.output,
            status: r.ok ? "ok" : r.empty ? "empty" : "unpaired",
        });
    }
    return rows;
}

/** tokenSweep for every token into the same position. */
export function fullSweep(
    def: AlgorithmDefinition,
    sourceTokens: string[],
    targetTokens: string[],
    options: EvaluateOptions = {},
): SweepRow[][] {
    const runs = {
        source: evaluate(def, sourceTokens, options),
        target: evaluate(def, targetTokens, options),
    };
    return targetTokens.map((_, t) =>
        tokenSweep(def, sourceTokens, targetTokens, t, t, options, runs),
    );
}

// ---------------------------------------------------------------- edits

/** The special tokens a Position ID at `cell` reads: those up to its token. */
export const specialsUpTo = (def: AlgorithmDefinition, cell: Cell): Ref[] =>
    (def.specialTokens ?? []).filter((t) => t <= cell.token).map((token) => ({ token }));

/** The definition with every Position ID reading the algorithm's special
 * tokens (and, given `specials`, with those as the special tokens). */
export function withSpecialTokens(
    def: AlgorithmDefinition,
    specials: number[] = def.specialTokens ?? [],
): AlgorithmDefinition {
    const sorted = [...new Set(specials)].sort((a, b) => a - b);
    const { specialTokens: _old, ...rest } = def;
    void _old;
    const next: AlgorithmDefinition = sorted.length ? { ...rest, specialTokens: sorted } : rest;
    return {
        ...next,
        variables: def.variables.map((v) =>
            v.function.kind === "primitive" && v.function.name === "position_id"
                ? {
                      ...v,
                      args: v.args.map((a) =>
                          a.name === "specials" ? { ...a, refs: specialsUpTo(next, v.cell) } : a,
                      ),
                  }
                : v,
        ),
    };
}

/** JSON with object keys sorted, so equal definitions compare equal. */
function canonical(x: unknown): unknown {
    if (Array.isArray(x)) return x.map(canonical);
    if (x && typeof x === "object")
        return Object.fromEntries(
            Object.keys(x as object)
                .sort()
                .filter((k) => (x as Record<string, unknown>)[k] !== undefined)
                .map((k) => [k, canonical((x as Record<string, unknown>)[k])]),
        );
    return x;
}

/** Whether two definitions are the same algorithm, whatever their key order. */
export function sameDefinition(a: AlgorithmDefinition, b: AlgorithmDefinition): boolean {
    return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** A fresh variable id that isn't taken. */
export function newVariableId(def: AlgorithmDefinition, base: string): string {
    const clean = base.replace(/[^A-Za-z0-9_]/g, "_") || "v";
    let id = clean;
    let i = 2;
    const taken = new Set(def.variables.map((v) => v.id));
    while (taken.has(id)) id = `${clean}_${i++}`;
    return id;
}

/** Remove variable `id` and every reference to it. */
export function removeVariable(def: AlgorithmDefinition, id: string): AlgorithmDefinition {
    return {
        ...def,
        output: def.output === id ? null : def.output,
        variables: def.variables
            .filter((v) => v.id !== id)
            .map((v) => ({
                ...v,
                args: v.args.map(
                    (a): Arg => ({
                        ...a,
                        refs: a.refs.filter((r) => !("variable" in r) || r.variable !== id),
                    }),
                ),
            })),
    };
}
