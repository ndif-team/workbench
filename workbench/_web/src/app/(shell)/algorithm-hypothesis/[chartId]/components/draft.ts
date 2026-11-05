/**
 * The variable being created or edited in the panel, before it is saved.
 *
 * Arguments are typed, named slots. A primitive fixes its slots (Lookup takes
 * key, keys and values, typed K, list of K, list of V); a Python function takes
 * whatever named arguments the user adds. Clicking a token or variable in the
 * grid adds a reference to the active slot, if its type fits.
 */

import type {
    AlgorithmDefinition,
    Arg,
    Cell,
    PrimitiveName,
    Ref,
    VarType,
    Variable,
    VariableFunction,
} from "@/types/algorithmHypothesis";
import {
    byId,
    inferTypes,
    inferVariable,
    isValidName,
    newVariableId,
    readersOf,
    refKey,
    refProblem,
    slotProblems,
    specialsUpTo,
} from "@/lib/algorithmHypothesis/engine";
import {
    PRIMITIVES,
    defaultOptions,
    isListSlot,
    primitiveAsPython,
    signatureOf,
} from "@/lib/algorithmHypothesis/primitives";
import { STRING, type Subst, type TypePattern } from "@/lib/algorithmHypothesis/vartypes";

export interface VariableDraft {
    id: string;
    isNew: boolean;
    name: string;
    cell: Cell;
    function: VariableFunction;
    args: Arg[];
    /** The declared type, for Python functions. Primitives infer theirs. */
    type: VarType | null;
    /** Display only; null is the default color. */
    color: string | null;
    tags: string[];
    isOutput: boolean;
    /** The slot that grid clicks fill, or null. */
    activeSlot: string | null;
    /** Python source was edited by hand, so don't regenerate the stub. */
    codeTouched: boolean;
    /** The name was typed by hand (or is an existing variable's), so it no
     * longer follows the function. */
    nameTouched: boolean;
    /** Why the last grid click couldn't be added. */
    pickError: string | null;
}

interface SlotView {
    name: string;
    /** The slot's type pattern; null for a Python function's arguments. */
    pattern: TypePattern | null;
    many: boolean;
    /** Python arguments can be renamed and removed. */
    custom: boolean;
}

export function slotsOf(draft: Pick<VariableDraft, "function" | "args">): SlotView[] {
    if (draft.function.kind === "python")
        return draft.args.map((a) => ({ name: a.name, pattern: null, many: true, custom: true }));
    return signatureOf(draft.function.name, draft.function.options).slots.map((s) => ({
        name: s.name,
        pattern: s.type,
        many: isListSlot(s),
        custom: false,
    }));
}

/** Position ID's `specials` follow the algorithm's special tokens; they aren't
 * picked by hand. */
export const isAutoSlot = (draft: Pick<VariableDraft, "function">, slot: string) =>
    draft.function.kind === "primitive" &&
    draft.function.name === "position_id" &&
    slot === "specials";

/** The draft with Position ID's `specials` set to the special tokens up to its cell. */
export function refreshSpecials(def: AlgorithmDefinition, draft: VariableDraft): VariableDraft {
    if (draft.function.kind !== "primitive" || draft.function.name !== "position_id") return draft;
    const refs = specialsUpTo(def, draft.cell);
    return {
        ...draft,
        args: draft.args.map((a) => (a.name === "specials" ? { ...a, refs } : a)),
    };
}

/** Default names follow the function: PosID1, Copy1, Retrieve1, Custom1, … */
const NAME_PREFIX: Record<PrimitiveName | "python", string> = {
    position_id: "PosID",
    copy: "Copy",
    pair: "Pair",
    retrieve: "Retrieve",
    index: "Index",
    key_of: "KeyOf",
    value_of: "ValueOf",
    mixture: "Mixture",
    constant: "Constant",
    python: "Custom",
};

/** `base` followed by the smallest number (from `start`) no other variable uses. */
function nextName(def: AlgorithmDefinition, base: string, exceptId: string, start = 1): string {
    const taken = new Set(def.variables.filter((v) => v.id !== exceptId).map((v) => v.name));
    let n = start;
    while (taken.has(`${base}${n}`)) n++;
    return `${base}${n}`;
}

/** The draft named after its function, unless its name was typed by hand. */
export function withDefaultName(def: AlgorithmDefinition, draft: VariableDraft): VariableDraft {
    if (draft.nameTouched) return draft;
    const fn = draft.function.kind === "python" ? "python" : draft.function.name;
    return { ...draft, name: nextName(def, NAME_PREFIX[fn], draft.id) };
}

const firstOpenSlot = (draft: Pick<VariableDraft, "function" | "args">): string | null => {
    for (const s of slotsOf(draft)) {
        if (isAutoSlot(draft, s.name)) continue;
        const refs = draft.args.find((a) => a.name === s.name)?.refs ?? [];
        if (!refs.length) return s.name;
    }
    return null;
};

function pythonStub(args: Arg[]): string {
    return `def compute(${args.map((a) => a.name).join(", ")}):\n    """Return this variable's value."""\n    return None\n`;
}

function argsForPrimitive(name: PrimitiveName, old: Arg[]): Arg[] {
    return PRIMITIVES[name].slots.map((s) => ({
        name: s.name,
        refs: old.find((a) => a.name === s.name)?.refs ?? [],
    }));
}

/** Types of references, from the saved algorithm (tokens are strings). */
export function refTyper(def: AlgorithmDefinition, tokens: string[]) {
    const { types } = inferTypes(def);
    const vars = byId(def);
    return {
        typeOf: (r: Ref): VarType | null =>
            "variable" in r ? (types.get(r.variable) ?? null) : STRING,
        labelOf: (r: Ref): string =>
            "variable" in r
                ? (vars.get(r.variable)?.name ?? "?")
                : `“${(tokens[r.token] ?? "").trim()}”`,
    };
}

/** The draft's type, the type variables its arguments bind, and type problems. */
export function draftTypes(
    def: AlgorithmDefinition,
    tokens: string[],
    draft: VariableDraft,
): { type: VarType | null; subst: Subst; problems: string[] } {
    const t = refTyper(def, tokens);
    return inferVariable(draft, t.typeOf, t.labelOf);
}

export function newDraft(def: AlgorithmDefinition, cell: Cell, nTokens: number): VariableDraft {
    const isOutputCell = cell.layer === def.grid.layers - 1 && cell.token === nTokens - 1;
    const fn: VariableFunction = isOutputCell
        ? { kind: "primitive", name: "copy", options: {} }
        : { kind: "primitive", name: "position_id", options: defaultOptions("position_id") };
    const draft: VariableDraft = {
        id: newVariableId(def, "v"),
        isNew: true,
        name: "",
        cell,
        function: fn,
        args: argsForPrimitive(fn.name, []),
        type: null,
        color: null,
        tags: [],
        isOutput: isOutputCell && !def.output,
        activeSlot: null,
        codeTouched: false,
        nameTouched: false,
        pickError: null,
    };
    draft.activeSlot = firstOpenSlot(draft);
    return withDefaultName(def, refreshSpecials(def, draft));
}

/** A copy of `v` as a new draft at `cell`, named like it with the next free
 * number (parent → parent2, PosID1 → PosID2). It keeps the function (custom
 * code included), arguments, type, color and tags; an argument that breaks a
 * rule at the new cell shows as a problem until it's fixed. */
export function pasteDraft(def: AlgorithmDefinition, v: Variable, cell: Cell): VariableDraft {
    const base = v.name.replace(/\d+$/, "");
    const name = base ? nextName(def, base, "", base === v.name ? 2 : 1) : nextName(def, "v", "");
    const draft: VariableDraft = {
        id: newVariableId(def, name),
        isNew: true,
        name,
        cell,
        function: structuredClone(v.function),
        args: v.args.map((a) => ({ name: a.name, refs: a.refs.map((r) => ({ ...r })) })),
        type: v.function.kind === "python" ? v.type : null,
        color: v.color ?? null,
        tags: [...(v.tags ?? [])],
        isOutput: false,
        activeSlot: null,
        codeTouched: true,
        nameTouched: true,
        pickError: null,
    };
    return refreshSpecials(def, draft);
}

export function draftFromVariable(def: AlgorithmDefinition, v: Variable): VariableDraft {
    const draft: VariableDraft = {
        id: v.id,
        isNew: false,
        name: v.name,
        cell: { ...v.cell },
        function: v.function,
        args: v.args.map((a) => ({ name: a.name, refs: [...a.refs] })),
        type: v.function.kind === "python" ? v.type : null,
        color: v.color ?? null,
        tags: [...(v.tags ?? [])],
        isOutput: def.output === v.id,
        activeSlot: null,
        codeTouched: true,
        nameTouched: true,
        pickError: null,
    };
    if (draft.function.kind === "primitive")
        draft.args = argsForPrimitive(draft.function.name, draft.args);
    draft.activeSlot = firstOpenSlot(draft);
    return draft;
}

/** Switch to a primitive (keeping references in slots with the same name) or
 * to a blank Python function that returns `type`. */
export function withFunction(
    draft: VariableDraft,
    target: PrimitiveName | "python",
    type: VarType | null,
): VariableDraft {
    if (target === "python") {
        if (draft.function.kind === "python") return draft;
        const args = draft.args.filter((a) => a.refs.length);
        return {
            ...draft,
            function: { kind: "python", source: pythonStub(args) },
            args,
            type: type ?? STRING,
            codeTouched: false,
            activeSlot: null,
            pickError: null,
        };
    }
    const next: VariableDraft = {
        ...draft,
        function: { kind: "primitive", name: target, options: defaultOptions(target) },
        args: argsForPrimitive(target, draft.args),
        type: null,
        pickError: null,
    };
    next.activeSlot = firstOpenSlot(next);
    return next;
}

/** Turn the draft's primitive into a custom Python function that starts from
 * the primitive's own source, with the same arguments and type. */
export function convertToPython(draft: VariableDraft, type: VarType | null): VariableDraft {
    if (draft.function.kind !== "primitive") return draft;
    return {
        ...draft,
        function: {
            kind: "python",
            source: primitiveAsPython(draft.function.name, draft.function.options),
        },
        type: type ?? STRING,
        codeTouched: true,
        activeSlot: null,
        pickError: null,
    };
}

/** A Python identifier for a new argument, derived from what it refers to. */
function argNameFor(label: string, taken: Set<string>): string {
    let base = label
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "");
    if (!base || /^[0-9]/.test(base)) base = `arg_${base}`.replace(/_+$/, "") || "arg";
    let name = base;
    let i = 2;
    while (taken.has(name)) name = `${base}_${i++}`;
    return name;
}

/** Add a grid click to the active slot (or, for Python, to a new argument),
 * if the rules and the slot's type allow it. */
export function addRef(
    def: AlgorithmDefinition,
    tokens: string[],
    draft: VariableDraft,
    ref: Ref,
): VariableDraft {
    if ("variable" in ref && ref.variable === draft.id)
        return { ...draft, pickError: "A variable can't read itself." };
    const problem = refProblem(def, draft.cell, ref);
    if (problem) return { ...draft, pickError: problem };

    const typer = refTyper(def, tokens);
    let slot = draft.activeSlot;
    let args = draft.args;
    if (draft.function.kind === "python" && !slot) {
        slot = argNameFor(
            typer.labelOf(ref).replace(/[“”]/g, ""),
            new Set(args.map((a) => a.name)),
        );
        args = [...args, { name: slot, refs: [] }];
    }
    if (!slot) return { ...draft, pickError: "Choose an argument to fill first." };

    const many = slotsOf({ function: draft.function, args }).find((s) => s.name === slot)?.many;
    const nextArgs = args.map((a) =>
        a.name !== slot ? a : { ...a, refs: many ? [...a.refs, ref] : [ref] },
    );
    const next: VariableDraft = { ...draft, args: nextArgs, pickError: null };
    if (next.function.kind === "primitive") {
        const before = inferVariable(draft, typer.typeOf, typer.labelOf).problems;
        const after = inferVariable(next, typer.typeOf, typer.labelOf).problems;
        const added = after.filter((p) => !before.includes(p));
        if (added.length) return { ...draft, pickError: added[0] };
        next.activeSlot = many ? slot : firstOpenSlot(next);
    } else {
        if (!next.codeTouched) next.function = { kind: "python", source: pythonStub(nextArgs) };
        next.activeSlot = slot;
    }
    return next;
}

export function removeRef(draft: VariableDraft, slot: string, index: number): VariableDraft {
    const args = draft.args.map((a) =>
        a.name !== slot ? a : { ...a, refs: a.refs.filter((_, i) => i !== index) },
    );
    return { ...draft, args, pickError: null };
}

export function renameArg(draft: VariableDraft, from: string, to: string): VariableDraft {
    const args = draft.args.map((a) => (a.name === from ? { ...a, name: to } : a));
    const next = { ...draft, args, activeSlot: draft.activeSlot === from ? to : draft.activeSlot };
    if (next.function.kind === "python" && !draft.codeTouched)
        next.function = { kind: "python", source: pythonStub(args) };
    return next;
}

export function addPythonArg(draft: VariableDraft): VariableDraft {
    const name = argNameFor("arg", new Set(draft.args.map((a) => a.name)));
    const args = [...draft.args, { name, refs: [] }];
    const next = { ...draft, args, activeSlot: name };
    if (next.function.kind === "python" && !draft.codeTouched)
        next.function = { kind: "python", source: pythonStub(args) };
    return next;
}

export function removePythonArg(draft: VariableDraft, name: string): VariableDraft {
    const args = draft.args.filter((a) => a.name !== name);
    const next = {
        ...draft,
        args,
        activeSlot: draft.activeSlot === name ? null : draft.activeSlot,
    };
    if (next.function.kind === "python" && !draft.codeTouched)
        next.function = { kind: "python", source: pythonStub(args) };
    return next;
}

function draftToVariable(draft: VariableDraft): Variable {
    const v: Variable = {
        id: draft.id,
        name: draft.name.trim(),
        cell: draft.cell,
        type: draft.function.kind === "python" ? draft.type : null,
        function: draft.function,
        args: draft.args,
    };
    // Saved only when set, like the Python package writes them.
    if (draft.color) v.color = draft.color;
    if (draft.tags.length) v.tags = draft.tags;
    return v;
}

/** The algorithm with the draft in place, for previews. */
export function applyDraft(def: AlgorithmDefinition, draft: VariableDraft): AlgorithmDefinition {
    const v = draftToVariable(draft);
    const exists = def.variables.some((x) => x.id === draft.id);
    const variables = exists
        ? def.variables.map((x) => (x.id === draft.id ? v : x))
        : [...def.variables, v];
    let output = def.output;
    if (draft.isOutput) output = draft.id;
    else if (output === draft.id) output = null;
    return { ...def, variables, output };
}

export interface DraftProblems {
    /** Stop saving. */
    blocking: string[];
    /** Saved anyway, so an algorithm can be built up step by step. */
    incomplete: string[];
}

export function draftProblems(
    def: AlgorithmDefinition,
    tokens: string[],
    draft: VariableDraft,
): DraftProblems {
    const nTokens = tokens.length;
    const blocking: string[] = [];
    const name = draft.name.trim();
    if (!name) blocking.push("Give the variable a name.");
    else if (!isValidName(name))
        blocking.push(
            "Names use letters, digits and single underscores, start with a letter, and can't be tok, raw_input, raw_output, render or TEMPLATE.",
        );
    else if (def.variables.some((v) => v.id !== draft.id && v.name === name))
        blocking.push(`Another variable is called ${name}.`);
    if (draft.cell.layer < 0 || draft.cell.layer >= def.grid.layers)
        blocking.push("That layer is outside the grid.");
    if (draft.cell.token < 0 || draft.cell.token >= nTokens)
        blocking.push("That token is outside the prompt.");
    for (const a of draft.args)
        for (const r of a.refs) {
            const p = refProblem(def, draft.cell, r);
            if (p) blocking.push(`${a.name}: ${p}`);
        }
    if (!draft.isNew)
        for (const r of readersOf(def, draft.id)) {
            if (r.cell.layer <= draft.cell.layer)
                blocking.push(
                    `${r.name} reads this variable at L${r.cell.layer}, so it must stay below L${r.cell.layer}.`,
                );
            else if (r.cell.token < draft.cell.token)
                blocking.push(
                    `${r.name} reads this variable at token ${r.cell.token}, so it can't sit to the right of it.`,
                );
        }
    if (
        draft.isOutput &&
        (draft.cell.layer !== def.grid.layers - 1 || draft.cell.token !== nTokens - 1)
    )
        blocking.push("Only a variable at the last layer and last token can be the output.");
    blocking.push(...draftTypes(def, tokens, draft).problems);
    const incomplete = slotProblems({
        function: draft.function,
        args: draft.args,
        type: draft.type,
    });
    return { blocking, incomplete };
}

export const refKeys = (draft: VariableDraft | null): Set<string> =>
    new Set(draft ? draft.args.flatMap((a) => a.refs.map(refKey)) : []);
