/**
 * Tool ↔ model support.
 *
 * Some tools only work with a subset of models (e.g. j-lens needs a Jacobian
 * lens checkpoint, exposed per-model as `model.has_jacobian`), while others
 * support every model. This is the single source of truth for "does tool T
 * support model M?" so no UI surface hardcodes a per-tool capability check.
 *
 * The backend describes model *capabilities* (real properties like
 * `has_jacobian`); here we map each *tool* to the capability it requires.
 * Adding a future restricted tool is one entry below (plus, if needed, one new
 * backend model flag) — every picker and run-gate keeps working unchanged.
 */

import type { Model } from "@/types/models";
import type { ToolType } from "@/types/charts";

type ToolSupport =
    | { supportsAll: true }
    | {
          supportsAll: false;
          /** Whether a specific model supports this tool. */
          isSupported: (model: Model) => boolean;
          /** Shown in tooltips / the tool's unsupported banner. */
          unsupportedReason: string;
      };

const TOOL_SUPPORT: Record<ToolType, ToolSupport> = {
    lens: { supportsAll: true },
    lens2: { supportsAll: true },
    "activation-patching": { supportsAll: true },
    "patch-lens": { supportsAll: true },
    patch: { supportsAll: true },
    jlens: {
        supportsAll: false,
        // `has_jacobian` is optional; a missing value means the backend couldn't
        // determine availability — fail closed so we never launch a run that
        // will error on NDIF, but the UI still explains why (unsupportedReason).
        isSupported: (model) => model.has_jacobian === true,
        unsupportedReason: "No J-Lens (Jacobian lens) is available for this model.",
    },
};

/** Landing page / launch dialog tool *display names* → the internal ToolType. */
export const TOOL_DISPLAY_TO_TYPE: Record<string, ToolType> = {
    "Logit Lens": "lens2",
    "J-Lens": "jlens",
    "Activation Patching": "activation-patching",
};

/** Whether a tool only supports a subset of models (vs. every model). */
export function isToolModelRestricted(tool: ToolType): boolean {
    return !TOOL_SUPPORT[tool].supportsAll;
}

/** Whether `model` supports `tool`. Unrestricted tools support every model. */
export function isToolSupportedForModel(tool: ToolType, model: Model): boolean {
    const rule = TOOL_SUPPORT[tool];
    return rule.supportsAll || rule.isSupported(model);
}

/** Filter `models` to those that support `tool`. */
export function supportedModelsFor(tool: ToolType, models: Model[]): Model[] {
    if (!isToolModelRestricted(tool)) return models;
    return models.filter((m) => isToolSupportedForModel(tool, m));
}

/**
 * Human-readable reason a tool is unavailable for unsupported models, or null
 * for tools that support every model.
 */
export function unsupportedReasonFor(tool: ToolType): string | null {
    const rule = TOOL_SUPPORT[tool];
    return rule.supportsAll ? null : rule.unsupportedReason;
}

/** Resolve a tool *display name* (from the landing/launch pickers) to a ToolType. */
export function toolTypeFromDisplay(display: string): ToolType | null {
    return TOOL_DISPLAY_TO_TYPE[display] ?? null;
}
