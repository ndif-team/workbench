import type { LogitLensConfigData } from "@/types/logitLens";
import type { JLensConfigData } from "@/types/jlens";
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
 *   2. config.data.model (fallback; logit lens has both, activation-patching only has this)
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
function configFieldsEqual<T extends object>(
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
 * Compare a logit lens draft against its saved config, excluding model.
 */
export function logitLensConfigEqualsExceptModel(
    saved: LogitLensConfigData | undefined | null,
    draft: Omit<LogitLensConfigData, "model"> | null | undefined,
): boolean {
    return configFieldsEqual(saved as LogitLensConfigData, draft as LogitLensConfigData, [
        (c) => c.prompt ?? "",
        (c) => c.topk ?? 5,
        (c) => c.includeEntropy ?? true,
    ]);
}

/**
 * Compare a j-lens draft against its saved config, excluding model. Same knobs
 * as the logit lens (prompt/top-k/entropy).
 */
export function jlensConfigEqualsExceptModel(
    saved: JLensConfigData | undefined | null,
    draft: Omit<JLensConfigData, "model"> | null | undefined,
): boolean {
    return configFieldsEqual(saved as JLensConfigData, draft as JLensConfigData, [
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
 * visualization differs from the workspace's current selection. Both the Logit Lens
 * and AP Display surfaces use this to decide whether to show the ChartModelPill.
 *
 * While the catalog is still loading (`modelsAvailable` false) we can't know
 * the current selection, so we report "not stale" rather than flashing the
 * pill on every chart open.
 */
export function isChartStale(
    chartModel: string | null,
    selectedModel: string | null,
    modelsAvailable: boolean,
): boolean {
    if (!chartModel) return false;
    if (!modelsAvailable) return false;
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
