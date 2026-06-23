import type { Lens2ConfigData } from "@/types/lens2";
import type { ActivationPatchingConfigData, SourcePosition } from "@/types/activationPatching";
import type { Token } from "@/types/models";

// ---- chart/config model resolution -------------------------------------------------

interface ChartWithMeta {
    data?: { meta?: { model?: string } } | null;
}

interface ConfigWithModel {
    data?: { model?: string };
}

/**
 * The model that produced a visualization, in order of authority:
 *   1. chart.data.meta.model (stamped by the run, when the tool's data shape carries it)
 *   2. config.data.model (fallback; lens2 has both, activation-patching only has this)
 *
 * Tools that don't stamp the model on their chart data can pass `undefined`
 * for `chart` — the config falls through.
 */
export function chartModelFromConfig(
    config: ConfigWithModel | undefined,
    chart?: ChartWithMeta | null,
): string | null {
    return chart?.data?.meta?.model ?? config?.data?.model ?? null;
}

// ---- generic field-by-field equality ----------------------------------------------

/**
 * Compare two objects by a list of field-getter lambdas. Returns true when
 * every getter produces the same value on both sides.
 *
 * Used by each tool to compare its draft config against the saved config,
 * excluding the model and any display-only fields (selectedLineIndices etc.)
 * which are auto-saved out of band.
 *
 * Both sides may be partial — we treat missing values via the getter
 * (`?? default` lives inside the getter, not here).
 */
export function configFieldsEqual<T extends object>(
    saved: T | null | undefined,
    draft: Partial<T> | null | undefined,
    fields: ReadonlyArray<(obj: T) => unknown>,
): boolean {
    if (!saved || !draft) return false;
    return fields.every((get) => get(saved) === get(draft as T));
}

// ---- activation-patching specific array helpers ------------------------------------

const srcPosEqual = (a: SourcePosition[], b: SourcePosition[]): boolean => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const x = a[i];
        const y = b[i];
        if (typeof x === "number" && typeof y === "number") {
            if (x !== y) return false;
        } else if (Array.isArray(x) && Array.isArray(y)) {
            if (x[0] !== y[0] || x[1] !== y[1]) return false;
        } else {
            return false;
        }
    }
    return true;
};

const numberArrayEqual = (a: number[], b: number[]): boolean =>
    a.length === b.length && a.every((v, i) => v === b[i]);

// ---- per-tool draft-vs-saved comparators -------------------------------------------

/**
 * Compare a lens2 draft against its saved config, excluding model.
 */
export function lens2ConfigEqualsExceptModel(
    saved: Lens2ConfigData | undefined | null,
    draft: Omit<Lens2ConfigData, "model"> | null | undefined,
): boolean {
    return configFieldsEqual(saved as Lens2ConfigData, draft as Lens2ConfigData, [
        (c) => c.prompt ?? "",
        (c) => c.topk ?? 5,
        (c) => c.includeEntropy ?? true,
    ]);
}

/**
 * Compare an activation-patching draft against its saved config, excluding
 * model. Display-only fields (`selectedLineIndices`, `selectedMode`) are also
 * excluded — those auto-save from the Display side and never trip the
 * "unsaved changes" state.
 *
 * The scalar fields go through `configFieldsEqual`; the array fields need
 * deep comparison and are checked separately.
 */
export function apConfigEqualsExceptModel(
    saved: ActivationPatchingConfigData | undefined | null,
    draft:
        | Pick<
              ActivationPatchingConfigData,
              "srcPrompt" | "tgtPrompt" | "srcPos" | "tgtPos" | "tgtFreeze"
          >
        | null
        | undefined,
): boolean {
    if (!saved || !draft) return false;
    const scalarsEqual = configFieldsEqual(
        saved as ActivationPatchingConfigData,
        draft as ActivationPatchingConfigData,
        [(c) => c.srcPrompt ?? "", (c) => c.tgtPrompt ?? ""],
    );
    if (!scalarsEqual) return false;
    return (
        srcPosEqual(saved.srcPos ?? [], draft.srcPos ?? []) &&
        numberArrayEqual(saved.tgtPos ?? [], draft.tgtPos ?? []) &&
        numberArrayEqual(saved.tgtFreeze ?? [], draft.tgtFreeze ?? [])
    );
}

// ---- shared display helpers --------------------------------------------------------

/**
 * Computes whether a chart is "stale" — the model behind the rendered
 * visualization differs from the workspace's current selection, or models
 * aren't available at all. Both the Lens2 and AP Display surfaces use this
 * to decide whether to show the ChartModelPill.
 */
export function isChartStale(
    chartModel: string | null,
    selectedModel: string | null,
    modelsAvailable: boolean,
): boolean {
    if (!chartModel) return false;
    if (!modelsAvailable) return true;
    return chartModel !== selectedModel;
}

// ---- tokenization comparison -------------------------------------------------------

/**
 * Compare two token sequences by surface text (length + .text).
 *
 * Text rather than id because positions refer to "where in the prompt" — what
 * the user actually sees — and two tokenizers can produce different ids for
 * tokens that render to the same text.
 */
export function tokenTextSequencesEqual(a: Token[], b: Token[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i].text !== b[i].text) return false;
    }
    return true;
}
