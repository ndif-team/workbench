"use client";

import { useCallback } from "react";
import { useParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import type { WorkshopTool } from "@/db/schema";

/**
 * Product analytics for the workshop tools. The single place event names live.
 *
 * Correlation model: every event's `distinct_id` is the Supabase `user_id`
 * (set by identify in `provider.tsx`) — the ONLY identifier PostHog holds. We
 * never attach workshop/Prolific IDs; tying an event to a Prolific participant
 * is an offline DB join on `user_id` (app_metadata / workspaces.prolific).
 *
 * Prompt text is never sent — capture `prompt_length` and the `chart_id`; the
 * full prompt lives in the Postgres config row, joinable via `chart_id`.
 */

/** The interpretability tools, tagged on every tool event via `tool`. */
export type Tool = WorkshopTool;

export type AnalyticsEvent =
    | "tool_opened"
    | "chart_created"
    | "run_submitted"
    | "run_completed"
    | "run_failed"
    | "param_changed"
    | "cell_expanded"
    | "patch_lens_intervention_applied"
    | "patch_lens_intervention_reset"
    | "run_restored";

type EventProperties = Record<string, unknown>;

/**
 * Returns a `capture(event, props)` function that merges the current route's
 * `workspace_id`/`chart_id` into every event, so call sites only pass the
 * event-specific properties. No-op until PostHog is initialized (e.g. when
 * `NEXT_PUBLIC_POSTHOG_KEY` is unset locally).
 */
export function useCapture() {
    const posthog = usePostHog();
    const params = useParams();
    const workspaceId = typeof params?.workspaceId === "string" ? params.workspaceId : undefined;
    const chartId = typeof params?.chartId === "string" ? params.chartId : undefined;

    return useCallback(
        (event: AnalyticsEvent, properties?: EventProperties) => {
            if (!posthog?.__loaded) return;
            posthog.capture(event, {
                workspace_id: workspaceId,
                chart_id: chartId,
                ...properties,
            });
        },
        [posthog, workspaceId, chartId],
    );
}
