import type { Model, ModelStatus } from "@/types/models";

/**
 * Shared status vocabulary for model heat states. Used by the workspace-header
 * ModelControl, the models grid, and any new surface that needs to color or
 * label deployment-level state.
 */
export type ModelHeat = ModelStatus;

export const MODEL_STATUS: Record<
    ModelHeat,
    { color: string; label: string; detail: string }
> = {
    hot: { color: "hsl(142 71% 45%)", label: "hot", detail: "loaded · ready to run" },
    warm: { color: "hsl(38 92% 50%)", label: "warm", detail: "cached · warming up" },
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
 * but aren't filterable; they're outcomes, not preferences. */
export const FILTERABLE_HEAT: ReadonlyArray<ModelHeat> = ["hot", "warm", "cold"];

export const deriveHeat = (model: Model | undefined): ModelHeat => {
    if (!model) return "unknown";
    if (model.status) return model.status;
    if (!model.allowed && model.gated) return "gated";
    if (!model.allowed) return "unavailable";
    return "unknown";
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
