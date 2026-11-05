import { describe, expect, it } from "bun:test";
import type { Model } from "@/types/models";
import { defaultModel, selectedModelIn } from "../status";

const model = (name: string, status: Model["status"], extra: Partial<Model> = {}): Model => ({
    name,
    is_chat: false,
    n_layers: 12,
    params: "1B",
    gated: false,
    allowed: true,
    status,
    ...extra,
});

describe("defaultModel", () => {
    it("never picks a cold model while a hot one exists, even when the cold one is first", () => {
        const models = [model("org/cold", "cold"), model("org/hot", "hot")];
        expect(defaultModel(models)?.name).toBe("org/hot");
    });

    it("prefers a hot model the user may run, then any hot, then a warm one", () => {
        const gatedHot = model("org/gated-hot", "hot", { gated: true, allowed: false });
        expect(defaultModel([gatedHot, model("org/hot", "hot")])?.name).toBe("org/hot");
        expect(defaultModel([model("org/cold", "cold"), gatedHot])?.name).toBe("org/gated-hot");
        expect(defaultModel([model("org/cold", "cold"), model("org/warm", "warm")])?.name).toBe(
            "org/warm",
        );
    });

    it("falls back to the first model when none can run now", () => {
        const models = [model("org/a", "cold"), model("org/b", "cold")];
        expect(defaultModel(models)?.name).toBe("org/a");
    });

    it("keeps to models the tool supports, unless none of them do", () => {
        const models = [
            model("org/hot", "hot"),
            model("org/hot-jacobian", "hot", { has_jacobian: true }),
        ];
        const jlens = (m: Model) => m.has_jacobian === true;
        expect(defaultModel(models, jlens)?.name).toBe("org/hot-jacobian");
        expect(defaultModel([model("org/hot", "hot")], jlens)?.name).toBe("org/hot");
    });
});

describe("selectedModelIn", () => {
    it("finds the selected model by name, whatever its position", () => {
        const models = [model("org/hot", "hot"), model("org/cold", "cold")];
        expect(selectedModelIn(models, "org/cold")?.name).toBe("org/cold");
        expect(selectedModelIn([...models].reverse(), "org/cold")?.name).toBe("org/cold");
    });

    it("falls back to the default model when nothing is selected or it left the catalog", () => {
        const models = [model("org/cold", "cold"), model("org/hot", "hot")];
        expect(selectedModelIn(models, null)?.name).toBe("org/hot");
        expect(selectedModelIn(models, "org/gone")?.name).toBe("org/hot");
        expect(selectedModelIn([], "org/hot")).toBeUndefined();
    });
});
