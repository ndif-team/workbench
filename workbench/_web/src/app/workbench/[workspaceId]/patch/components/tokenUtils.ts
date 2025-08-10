import type { Token } from "@/types/models";
import type { RangeGroup } from "./PatchProvider";

// Simple local tokenization fallback: split on whitespace and preserve newlines as tokens
export function tokenizeLocal(text: string): Token[] {
    const tokens: Token[] = [];
    // Split but keep whitespace/newlines boundaries
    const regex = /(\n+|\s+|[^\s]+)/g;
    const parts = text.match(regex) || [];
    let idx = 0;
    for (const part of parts) {
        // Merge consecutive whitespace except newlines into single space token
        if (/^\s+$/.test(part) && !/\n/.test(part)) {
            const trimmed = " ";
            tokens.push({ idx, id: idx, text: trimmed, targetIds: [] });
            idx++;
            continue;
        }
        tokens.push({ idx, id: idx, text: part, targetIds: [] });
        idx++;
    }
    return tokens;
}

// Myers diff (token-level) returning indices that differ in each sequence
// We implement a minimal Myers diff for sequences of strings
function myersDiff(a: string[], b: string[]) {
    const N = a.length;
    const M = b.length;
    const max = N + M;
    const v: Record<number, number> = { 1: 0 };
    const trace: Record<number, Record<number, number>> = {};
    for (let d = 0; d <= max; d++) {
        trace[d] = { ...v };
        for (let k = -d; k <= d; k += 2) {
            let x: number;
            if (k === -d || (k !== d && v[k - 1] < v[k + 1])) {
                x = v[k + 1];
            } else {
                x = v[k - 1] + 1;
            }
            let y = x - k;
            while (x < N && y < M && a[x] === b[y]) {
                x++;
                y++;
            }
            v[k] = x;
            if (x >= N && y >= M) {
                trace[d] = { ...v };
                return { d, trace };
            }
        }
        trace[d] = { ...v };
    }
    return { d: max, trace };
}

function backtrack(a: string[], b: string[], trace: Record<number, Record<number, number>>, d: number) {
    const N = a.length;
    const M = b.length;
    let x = N;
    let y = M;
    const edits: { type: "match" | "insert" | "delete"; x: number; y: number }[] = [];

    for (let depth = d; depth > 0; depth--) {
        const v = trace[depth];
        const k = x - y;
        let prevK: number;
        if (k === -depth || (k !== depth && v[k - 1] < v[k + 1])) {
            prevK = k + 1;
        } else {
            prevK = k - 1;
        }
        const prevX = v[prevK];
        const prevY = prevX - prevK;
        while (x > prevX && y > prevY) {
            edits.push({ type: "match", x: x - 1, y: y - 1 });
            x--;
            y--;
        }
        if (x === prevX) {
            edits.push({ type: "insert", x: x, y: y - 1 });
            y--;
        } else {
            edits.push({ type: "delete", x: x - 1, y: y });
            x--;
        }
    }
    while (x > 0 && y > 0) {
        edits.push({ type: "match", x: x - 1, y: y - 1 });
        x--;
        y--;
    }
    edits.reverse();
    return edits;
}

export function computeInitialDiffGroups(src: Token[], dst: Token[]): { sourceGroups: RangeGroup[]; destGroups: RangeGroup[] } {
    const a = src.map(t => t.text);
    const b = dst.map(t => t.text);
    const { d, trace } = myersDiff(a, b);
    const edits = backtrack(a, b, trace, d);

    const differingA: boolean[] = new Array(a.length).fill(false);
    const differingB: boolean[] = new Array(b.length).fill(false);

    let ai = 0;
    let bi = 0;
    for (const e of edits) {
        if (e.type === "match") {
            ai++;
            bi++;
        } else if (e.type === "delete") {
            if (ai < differingA.length) differingA[ai] = true;
            ai++;
        } else if (e.type === "insert") {
            if (bi < differingB.length) differingB[bi] = true;
            bi++;
        }
    }

    const sourceGroups: RangeGroup[] = collapseToGroups(differingA);
    const destGroups: RangeGroup[] = collapseToGroups(differingB);
    return { sourceGroups, destGroups };
}

function collapseToGroups(flags: boolean[]): RangeGroup[] {
    const groups: RangeGroup[] = [];
    let i = 0;
    while (i < flags.length) {
        if (!flags[i]) { i++; continue; }
        let j = i;
        while (j + 1 < flags.length && flags[j + 1]) j++;
        groups.push({ start: i, end: j });
        i = j + 1;
    }
    return groups;
}