import { describe, it, expect } from "bun:test";

import { resolveUnitSpotlights } from "@/types/tutorial-content";
import type { HintRung, SpotlightTarget, TutorialUnit } from "@/types/tutorial-content";

/**
 * The panel's spotlight payload. It is a pure function because it used to be three
 * effects writing the same channel, each overwriting the others — which is how the
 * hint-revealed rings came to vanish on a remount and how a restored patch came to
 * erase the cells its step's task names.
 */

const unit = (overrides: Partial<TutorialUnit> = {}): TutorialUnit => ({
    id: "u",
    kind: "lens",
    title: "Unit",
    task: "task",
    concept: "concept",
    prompts: [],
    hints: [],
    observationPrompt: "What did you notice?",
    progression: { on: "run" },
    ...overrides,
});

const drag: SpotlightTarget[] = [
    { grid: "source", layer: 20, position: 5 },
    { grid: "target", layer: 20, position: 5 },
];
const rung = (stage: number, spotlights?: SpotlightTarget[]): HintRung => ({
    stage,
    text: `hint ${stage}`,
    ...(spotlights ? { spotlights } : {}),
});

describe("resolveUnitSpotlights", () => {
    it("lights nothing when the unit has nothing to light", () => {
        expect(resolveUnitSpotlights(undefined, 0, false)).toBeNull();
        expect(resolveUnitSpotlights(unit(), 3, true)).toBeNull();
    });

    it("forces a layer's column without ringing a cell", () => {
        // No position: the widget renders that layer and rings nothing. This is the
        // compare step, whose task is to find those rows — a ring would do the task.
        const cells = resolveUnitSpotlights(
            unit({ forceLayers: [{ grid: "source", layer: 20 }] }),
            0,
            false,
        );
        expect(cells).toEqual([{ grid: "source", layer: 20 }]);
        expect(cells![0].position).toBeUndefined();
    });

    it("derives a revealed hint's cells from the persisted stage, not from the reveal", () => {
        // The imperative version of this was lost on any remount (a reload, or
        // collapsing the tutorial dock) while the hint still read as revealed.
        const u = unit({ hints: [rung(1), rung(2, drag)] });
        expect(resolveUnitSpotlights(u, 1, false)).toBeNull();
        expect(resolveUnitSpotlights(u, 2, false)).toEqual(drag);
    });

    it("prefers a rung's `spotlights` over its singular `spotlight`", () => {
        const single: SpotlightTarget = { grid: "result", layer: "last", position: "last" };
        const u = unit({ hints: [{ stage: 1, text: "h", spotlight: single, spotlights: drag }] });
        expect(resolveUnitSpotlights(u, 1, false)).toEqual(drag);
        const u2 = unit({ hints: [{ stage: 1, text: "h", spotlight: single }] });
        expect(resolveUnitSpotlights(u2, 1, false)).toEqual([single]);
    });

    it("keeps an earlier rung's cells when a later revealed rung has none of its own", () => {
        // Revealed rungs stay on screen together, so the rungs below a cell-less one
        // are still the instructions being followed.
        const u = unit({ hints: [rung(1, drag), rung(2)] });
        expect(resolveUnitSpotlights(u, 2, false)).toEqual(drag);
    });

    it("adds the patch result to the step's own cells rather than replacing them", () => {
        // Commit f3d193a: a patch restored from an earlier session is re-filed on
        // arrival with no result grid rendered, and substituting there deleted the
        // two cells the task names — and with them the patch layer, since a
        // spotlight is also what forces a downsampled layer to render.
        const u = unit({ kind: "patch", progression: { on: "patch" }, spotlights: drag });
        expect(resolveUnitSpotlights(u, 0, false)).toEqual(drag);
        expect(resolveUnitSpotlights(u, 0, true)).toEqual([
            ...drag,
            { grid: "result", layer: "last", position: "last" },
        ]);
    });

    it("does not point at a result cell on a step that has no patch", () => {
        expect(resolveUnitSpotlights(unit({ spotlights: drag }), 0, true)).toEqual(drag);
    });

    it("unions forced layers, arrival rings and the revealed rung", () => {
        const u = unit({
            forceLayers: [{ grid: "source", layer: 20 }],
            spotlights: [{ grid: "target", layer: "last", position: "last" }],
            hints: [rung(1, drag)],
        });
        expect(resolveUnitSpotlights(u, 1, false)).toEqual([
            { grid: "source", layer: 20 },
            { grid: "target", layer: "last", position: "last" },
            ...drag,
        ]);
    });
});
