/**
 * The paper's algorithms as examples, placed on any entity-binding prompt.
 *
 * Gur-Arieh, Geva & Geiger (2025), "Mixing Mechanisms". Placement finds the
 * template's tokens by text ("{person} loves {food}, … What does {query} love?"),
 * so the same example works on abstract word tokens and on a model's tokens.
 *
 * The names are the algorithm's special tokens. Position ID numbers them in
 * order of first appearance and stores each as a position ID : name pair.
 *
 * Positional: each name's position ID is copied onto its bound entity, which
 * then holds a position ID : entity pair. The recalled name gets its first
 * mention's position ID, and that position ID retrieves the bound entity.
 * Lexical: each entity is bound to its name; the recalled name retrieves it.
 * Reflexive: the query token retrieves the entity itself (a pointer), and the
 * last token dereferences it: it retrieves by value, which finds nothing if the
 * entity isn't in context.
 * Mixed: all three at once, each computing its own answer (pos_answer,
 * lex_answer, ref_answer; the positional bindings become pos_bind), combined
 * linearly into the answer at the last token.
 *
 * Mirrors presets.py in the `algorithm_hypothesis` Python package.
 */

import {
    ALGORITHM_SCHEMA_ID,
    type AlgorithmDefinition,
    type AlgorithmGrid,
    type Arg,
    type PrimitiveName,
    type Ref,
    type Variable,
} from "@/types/algorithmHypothesis";
import { withInferredTypes } from "./engine";

export const EXAMPLE_KINDS = ["positional", "lexical", "reflexive", "mixed"] as const;
export type ExampleKind = (typeof EXAMPLE_KINDS)[number];

export const EXAMPLE_NAMES: Record<ExampleKind, string> = {
    positional: "Positional",
    lexical: "Lexical",
    reflexive: "Reflexive",
    mixed: "Mixed",
};

const DESCRIPTIONS: Record<ExampleKind, string> = {
    positional:
        "Each name's position ID is copied onto its bound entity; the recalled name's position ID retrieves it.",
    lexical:
        "Each entity is bound to its name; the recalled name itself retrieves the bound entity.",
    reflexive:
        "The query retrieves a pointer to the answer entity itself, which is dereferenced at the end. Fails if the entity isn't in context.",
    mixed: "The union of the three algorithms: each computes its own answer, and the last token combines them linearly into a distribution over the entities.",
};

/** Each example colors a variable by the one algorithm it serves; variables
 * shared by several algorithms stay black. */
const ALGORITHM_COLORS = {
    positional: "indigo",
    lexical: "emerald",
    reflexive: "amber",
} as const;

type Mechanism = keyof typeof ALGORITHM_COLORS;

/** Which of the three algorithms a variable of an example serves. The
 * positional example binds position IDs; the others bind names, which serve
 * both lexical and reflexive retrieval. Mixed's answer combines all three. */
function serves(id: string, kind: ExampleKind): Mechanism[] {
    if (id.startsWith("pos") || id.startsWith("id") || id === "q_pos" || id === "P")
        return ["positional"];
    if (id.startsWith("bind") && kind === "positional") return ["positional"];
    if (id === "q_key" || id === "L" || id === "lex_answer") return ["lexical"];
    if (id === "q_ptr" || id === "R" || id === "ref_answer") return ["reflexive"];
    if (id.startsWith("bind")) return ["lexical", "reflexive"];
    if (id === "answer" && kind !== "mixed") return [kind];
    return [];
}

/** (names, bound entities, query token, last token, answer) layers. 26 loosely
 * follows the paper's gemma-2-2b-it findings (binding window 16–18). */
const KNOWN_LAYERS: Record<number, [number, number, number, number, number]> = {
    8: [1, 2, 3, 5, 7],
    26: [6, 8, 12, 16, 19],
};

interface EntityBindingSlots {
    people: number[];
    foods: number[];
    query: number;
    last: number;
}

const clean = (t: string) => t.trim().toLowerCase();

/** Token indices of the people, foods, query and last token, or an error message. */
function findSlots(tokens: string[]): EntityBindingSlots | string {
    const words = tokens.map(clean);
    const delimiters = new Set([",", ".", "and"]);
    const qStart = words.findIndex((w) => w === "what" || w === "who" || w === "which");
    if (qStart < 0) return "The examples need a question such as “What does Tim love?”.";
    const people: number[] = [];
    const foods: number[] = [];
    for (let j = 1; j < qStart - 1; j++) {
        if (words[j] !== "loves") continue;
        people.push(j - 1);
        let k = j + 1;
        while (k + 1 < qStart && !delimiters.has(words[k + 1]) && words[k + 1] !== "loves") k++;
        foods.push(k);
    }
    if (people.length < 2) return "The examples need at least two “{person} loves {food}” clauses.";
    const does = words.indexOf("does", qStart);
    const love = does < 0 ? -1 : words.indexOf("love", does);
    if (does < 0 || love < 0)
        return "The examples need a question of the form “What does {person} love?”.";
    if (love - does < 2) return "The question is missing the person.";
    return { people, foods, query: love - 1, last: tokens.length - 1 };
}

/** The names in an entity-binding prompt (“Ann loves ale, … What does Tim
 * love?”), which the paper's algorithms mark as special tokens; none for any
 * other prompt. */
export function nameTokens(tokens: string[]): number[] {
    const s = findSlots(tokens);
    return typeof s === "string" ? [] : [...s.people, s.query];
}

// Python's round() rounds halves to even; match it.
function pyRound(x: number): number {
    const f = Math.floor(x);
    const d = x - f;
    if (d > 0.5) return f + 1;
    if (d < 0.5) return f;
    return f % 2 === 0 ? f : f + 1;
}

function layerPlan(nLayers: number): [number, number, number, number, number] | string {
    if (KNOWN_LAYERS[nLayers]) return KNOWN_LAYERS[nLayers];
    if (nLayers < 6) return "The examples need at least 6 layers.";
    const top = nLayers - 1;
    const plan = [0.15, 0.3, 0.45, 0.62].map((f) => pyRound(f * top));
    for (let i = 1; i < 4; i++) plan[i] = Math.max(plan[i], plan[i - 1] + 1);
    return [plan[0], plan[1], plan[2], plan[3], Math.min(top, plan[3] + 3)];
}

const tok = (i: number): Ref => ({ token: i });
const ref = (id: string): Ref => ({ variable: id });

function variable(
    id: string,
    layer: number,
    token: number,
    fn: PrimitiveName,
    args: [string, Ref[]][],
    options: Record<string, string | number> = {},
): Variable {
    return {
        id,
        name: id,
        cell: { layer, token },
        type: null,
        function: { kind: "primitive", name: fn, options },
        args: args.map(([name, refs]): Arg => ({ name, refs })),
    };
}

/** One of the paper's algorithms placed on `tokens`, or an error message. */
export function entityBindingExample(
    kind: ExampleKind,
    tokens: string[],
    grid: AlgorithmGrid,
    template: string,
): AlgorithmDefinition | string {
    const s = findSlots(tokens);
    if (typeof s === "string") return s;
    const plan = layerPlan(grid.layers);
    if (typeof plan === "string") return plan;
    const [names, bound, q, last, a] = plan;
    const n = s.foods.length;
    const ids = (prefix: string) => Array.from({ length: n }, (_, k) => `${prefix}${k + 1}`);
    const pos = ids("pos");
    const idOf = ids("id");
    const bind = ids("bind");
    const specials = [...s.people, s.query];
    const vs: Variable[] = [];
    // The special tokens up to this one: the names it numbers.
    const position = (id: string, layer: number, token: number) =>
        variable(id, layer, token, "position_id", [
            ["token", [tok(token)]],
            ["specials", specials.filter((i) => i <= token).map(tok)],
        ]);
    // Each algorithm's answer. Mixed computes all three a layer early and
    // combines them where the others answer.
    if (kind === "mixed" && a - 1 <= last) return "The mixed example needs at least 7 layers.";
    const at = kind === "mixed" ? a - 1 : a;
    const answer = (prefix: string) => (kind === "mixed" ? `${prefix}_answer` : "answer");
    const retrieve = (id: string, key: Ref, pairs: string[], match: "key" | "value") =>
        variable(
            id,
            at,
            s.last,
            "retrieve",
            [
                ["key", [key]],
                ["pairs", pairs.map(ref)],
            ],
            { match },
        );

    if (kind === "positional" || kind === "mixed") {
        // Copying a position ID onto the entity takes one layer (KeyOf), binding it another.
        const boundAt = Math.max(bound, names + 2);
        const pbind = kind === "positional" ? bind : ids("pos_bind");
        s.people.forEach((p, k) => vs.push(position(pos[k], names, p)));
        s.foods.forEach((f, k) =>
            vs.push(variable(idOf[k], names + 1, f, "key_of", [["pair", [ref(pos[k])]]])),
        );
        s.foods.forEach((f, k) =>
            vs.push(
                variable(pbind[k], boundAt, f, "pair", [
                    ["key", [ref(idOf[k])]],
                    ["value", [tok(f)]],
                ]),
            ),
        );
        vs.push(position("q_pos", q, s.query));
        vs.push(variable("P", last, s.last, "key_of", [["pair", [ref("q_pos")]]]));
        vs.push(retrieve(answer("pos"), ref("P"), pbind, "key"));
    }
    if (kind !== "positional")
        s.foods.forEach((f, k) =>
            vs.push(
                variable(bind[k], bound, f, "pair", [
                    ["key", [tok(s.people[k])]],
                    ["value", [tok(f)]],
                ]),
            ),
        );
    if (kind === "lexical" || kind === "mixed") {
        vs.push(variable("q_key", q, s.query, "copy", [["x", [tok(s.query)]]]));
        vs.push(variable("L", last, s.last, "copy", [["x", [ref("q_key")]]]));
        vs.push(retrieve(answer("lex"), ref("L"), bind, "key"));
    }
    if (kind === "reflexive" || kind === "mixed") {
        vs.push(
            variable(
                "q_ptr",
                q,
                s.query,
                "retrieve",
                [
                    ["key", [tok(s.query)]],
                    ["pairs", bind.map(ref)],
                ],
                { match: "key" },
            ),
        );
        vs.push(variable("R", last, s.last, "copy", [["x", [ref("q_ptr")]]]));
        // Dereference: the bound entity equal to R, if there is one.
        vs.push(retrieve(answer("ref"), ref("R"), bind, "value"));
    }
    if (kind === "mixed")
        vs.push(
            variable(
                "answer",
                a,
                s.last,
                "mixture",
                [["answers", ["pos", "lex", "ref"].map((p) => ref(answer(p)))]],
                { weights: "1, 1, 1" },
            ),
        );

    for (const v of vs) {
        const tags = serves(v.id, kind);
        if (tags.length) v.tags = tags;
        if (tags.length === 1) v.color = ALGORITHM_COLORS[tags[0]];
    }

    let output = "answer";
    if (a < grid.layers - 1) {
        vs.push(variable("output", grid.layers - 1, s.last, "copy", [["x", [ref("answer")]]]));
        output = "output";
    }
    return withInferredTypes({
        schema: ALGORITHM_SCHEMA_ID,
        name: EXAMPLE_NAMES[kind],
        description: DESCRIPTIONS[kind],
        grid,
        template,
        variables: vs,
        output,
        specialTokens: specials,
    });
}
