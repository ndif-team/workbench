/**
 * Drafts in the variable panel: default names that follow the function, and
 * pasting a copy of a variable into another cell.
 */

import { describe, it, expect } from "bun:test";
import type { AlgorithmDefinition } from "@/types/algorithmHypothesis";
import golden from "./golden.entity_binding.json";
import { entityBindingExample } from "../presets";
import {
    applyDraft,
    newDraft,
    pasteDraft,
    withDefaultName,
    withFunction,
    draftProblems,
} from "@/app/workbench/[workspaceId]/algorithm-hypothesis/[chartId]/components/draft";

const G = golden as unknown as {
    prompts: Record<string, string>;
    tokens: Record<string, string[]>;
};
const TARGET = G.tokens.target;
const alg = entityBindingExample(
    "positional",
    TARGET,
    { kind: "abstract", layers: 8 },
    G.prompts.target,
) as AlgorithmDefinition;

describe("default names", () => {
    it("follow the function with the next free number until typed", () => {
        const d = newDraft(alg, { layer: 4, token: 2 }, TARGET.length);
        expect(d.name).toBe("PosID1");
        const copy = withDefaultName(alg, withFunction(d, "copy", null));
        expect(copy.name).toBe("Copy1");
        const custom = withDefaultName(alg, withFunction(copy, "python", null));
        expect(custom.name).toBe("Custom1");
        const typed = { ...copy, name: "carry", nameTouched: true };
        expect(withDefaultName(alg, withFunction(typed, "pair", null)).name).toBe("carry");

        // The next PosID skips names already taken.
        const saved = applyDraft(alg, d);
        expect(newDraft(saved, { layer: 4, token: 3 }, TARGET.length).name).toBe("PosID2");
    });
});

describe("pasting a copy", () => {
    it("keeps the definition, takes the next name, and flags arguments that break rules", () => {
        const bind2 = alg.variables.find((v) => v.id === "bind2")!;
        const here = pasteDraft(alg, bind2, { layer: 4, token: 6 });
        expect(here.name).toBe("bind5");
        expect(here.function).toEqual(bind2.function);
        expect(here.args).toEqual(bind2.args);
        expect(draftProblems(alg, TARGET, here).blocking).toEqual([]);

        // At L1, id2 (L2) is no longer below it.
        const low = pasteDraft(alg, bind2, { layer: 1, token: 6 });
        expect(draftProblems(alg, TARGET, low).blocking.join(" ")).toContain("lower layer");

        const custom = {
            ...bind2,
            name: "parent",
            function: {
                kind: "python" as const,
                source: "def compute(key, value):\n    return key\n",
            },
            type: { kind: "position" as const },
        };
        const copied = pasteDraft({ ...alg, variables: [...alg.variables, custom] }, custom, {
            layer: 4,
            token: 8,
        });
        expect(copied.name).toBe("parent2");
        expect(copied.function).toEqual(custom.function);
        expect(copied.type).toEqual({ kind: "position" });
    });
});
