import type { Model, ModelStatus } from "@/types/models";

/**
 * Shared status vocabulary for model heat states. Used by the workspace-header
 * ModelControl, the models grid, and any new surface that needs to color or
 * label deployment-level state.
 */
export type ModelHeat = ModelStatus;

export const MODEL_STATUS: Record<ModelHeat, { color: string; label: string; detail: string }> = {
    hot: { color: "hsl(142 71% 45%)", label: "hot", detail: "loaded · ready to run" },
    warm: { color: "hsl(38 92% 50%)", label: "warm", detail: "cached · warming up" },
    deploying: {
        color: "hsl(38 92% 50%)",
        label: "deploying",
        detail: "loading onto backend",
    },
    cold: { color: "hsl(217 91% 60%)", label: "cold", detail: "on disk · cold start" },
    gated: { color: "hsl(270 70% 55%)", label: "gated", detail: "sign in to access" },
    unavailable: {
        color: "hsl(0 84% 60%)",
        label: "unavailable",
        detail: "not deployed",
    },
    unknown: {
        color: "hsl(var(--muted-foreground))",
        label: "unknown",
        detail: "status unavailable",
    },
};

/** Status keys the user can filter by — gated/unavailable/unknown still appear on cards
 * but aren't filterable; they're outcomes, not preferences. "deploying" is also
 * omitted on purpose: it's a transient mid-load state, not a stable preference. */
export const FILTERABLE_HEAT: ReadonlyArray<ModelHeat> = ["hot", "warm", "cold"];

/** Heats a user can run right now. COLD models must be deployed (warmed up
 * via the deploy flow) before they become runnable. Centralized here so cold
 * checks don't get scattered across the selector, cards, and chart panels. */
export const SELECTABLE_HEATS: ReadonlyArray<ModelHeat> = ["hot", "warm"];

/** True when the model is deployed and immediately runnable (hot or warm). */
export const isModelRunnable = (model: Model | undefined): boolean =>
    !!model && model.status !== undefined && SELECTABLE_HEATS.includes(model.status);

/** True when the model is in the catalog but not currently deployed (cold). */
export const isModelCold = (model: Model | undefined): boolean =>
    !!model && model.status === "cold";

/** True when NDIF is mid-load for this model (application_state DEPLOYING) —
 * not yet runnable, but warming up. May reflect another user's deploy or our
 * own in-flight warmup as the catalog catches up. */
export const isModelDeploying = (model: Model | undefined): boolean =>
    !!model && model.status === "deploying";

export const deriveHeat = (model: Model | undefined): ModelHeat => {
    if (!model) return "unknown";
    // Access control wins over deployment heat: a model the current user
    // can't run (gated + not allowed, e.g. an anonymous visitor on a >=8B
    // model) reads as "gated" even if NDIF currently has it hot. Once the
    // user can access it (allowed === true), we fall through to the real
    // deployment heat.
    if (model.gated && !model.allowed) return "gated";
    if (model.status) return model.status;
    if (!model.allowed) return "unavailable";
    return "unknown";
};

/** Repo id → { org, label }. `"meta-llama/Llama-3.1-8B"` → org "meta-llama",
 * label "Llama-3.1-8B". Org is empty for bare names. */
export const splitRepo = (name: string): { org: string; label: string } => {
    const slash = name.lastIndexOf("/");
    if (slash === -1) return { org: "", label: name };
    return { org: name.slice(0, slash), label: name.slice(slash + 1) };
};

/** Heat ordering for sorting model lists — hottest first. Unknown/gated/
 * unavailable sink to the bottom. */
export const HEAT_ORDER: ReadonlyArray<ModelHeat> = [
    "hot",
    "warm",
    "deploying",
    "cold",
    "unknown",
    "gated",
    "unavailable",
];

export const heatRank = (model: Model): number => {
    const i = HEAT_ORDER.indexOf(deriveHeat(model));
    return i === -1 ? HEAT_ORDER.length : i;
};

/** Group palette — the two model families the catalog currently has. */
export const GROUP_HUE: Record<"base" | "chat", number> = {
    base: 217, // blue (matches --primary)
    chat: 270, // violet
};

export type ModelGroup = keyof typeof GROUP_HUE;

/** Saturated heat-style color for a group — same shape as MODEL_STATUS[heat].color
 * so the filter chips can re-use the HeatBadge color-mix idiom. */
export const GROUP_COLOR: Record<ModelGroup, string> = {
    base: `hsl(${GROUP_HUE.base} 70% 45%)`,
    chat: `hsl(${GROUP_HUE.chat} 70% 50%)`,
};
