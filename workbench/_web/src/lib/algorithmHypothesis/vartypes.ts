/**
 * Variable types and the patterns primitive signatures are written in.
 * Mirrors vartypes.py in the `algorithm_hypothesis` Python package.
 */

import type { VarType } from "@/types/algorithmHypothesis";

/** A type, a type variable (K, V, T) or a list, as used in signatures. */
export type TypePattern =
    | { kind: "string" }
    | { kind: "int" }
    | { kind: "position" }
    | { kind: "pair"; key: TypePattern; value: TypePattern }
    | { kind: "var"; name: string }
    | { kind: "list"; of: TypePattern };

export type Subst = Record<string, VarType>;

export const STRING: VarType = { kind: "string" };
export const POSITION: VarType = { kind: "position" };
export const BASIC_KINDS = ["string", "int", "position"] as const;

export const pairOf = (key: TypePattern, value: TypePattern): TypePattern => ({
    kind: "pair",
    key,
    value,
});
export const listOf = (of: TypePattern): TypePattern => ({ kind: "list", of });
export const typeVar = (name: string): TypePattern => ({ kind: "var", name });

export function isVarType(t: unknown): t is VarType {
    if (!t || typeof t !== "object") return false;
    const k = (t as { kind?: string }).kind;
    if (k === "string" || k === "int" || k === "position") return true;
    if (k !== "pair") return false;
    const p = t as { key?: unknown; value?: unknown };
    return isVarType(p.key) && isVarType(p.value);
}

function sameType(a: VarType | null, b: VarType | null): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

/** Readable name: "position", "list of string", "position : string". */
export function describeType(t: TypePattern | null | undefined, subst: Subst = {}): string {
    if (!t) return "unknown";
    switch (t.kind) {
        case "var": {
            const bound = subst[t.name];
            return bound ? describeType(bound) : `any type (${t.name})`;
        }
        case "list":
            return `list of ${describeType(t.of, subst)}`;
        case "pair": {
            const side = (x: TypePattern) => {
                const s = describeType(x, subst);
                return x.kind === "pair" ? `(${s})` : s;
            };
            return `${side(t.key)} : ${side(t.value)}`;
        }
        default:
            return t.kind;
    }
}

/** Match a concrete type against a pattern, binding type variables in `subst`. */
export function unify(pattern: TypePattern, t: VarType, subst: Subst): boolean {
    if (pattern.kind === "var") {
        const bound = subst[pattern.name];
        if (!bound) {
            subst[pattern.name] = t;
            return true;
        }
        return sameType(bound, t);
    }
    if (pattern.kind === "pair")
        return (
            t.kind === "pair" &&
            unify(pattern.key, t.key, subst) &&
            unify(pattern.value, t.value, subst)
        );
    if (pattern.kind === "list") return false;
    return t.kind === pattern.kind;
}

/** The concrete type a pattern stands for, or null if a variable is unbound. */
export function substitute(pattern: TypePattern, subst: Subst): VarType | null {
    switch (pattern.kind) {
        case "var":
            return subst[pattern.name] ?? null;
        case "pair": {
            const key = substitute(pattern.key, subst);
            const value = substitute(pattern.value, subst);
            return key && value ? { kind: "pair", key, value } : null;
        }
        case "list":
            return null;
        default:
            return { kind: pattern.kind };
    }
}
