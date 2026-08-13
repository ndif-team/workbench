"use client";

import { useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useWorkspaceWorkshop } from "@/lib/api/workshopApi";
import { useTutorialEmit } from "@/components/providers/TutorialEventProvider";

/**
 * Product analytics for the workshop tools. The single place event names live.
 *
 * Correlation model: every event's `distinct_id` is the Supabase `user_id`
 * (set by identify in `provider.tsx`) — the only PARTICIPANT identifier
 * PostHog holds. Prolific IDs are still never attached; tying an event to a
 * Prolific participant remains an offline DB join on `user_id`
 * (app_metadata / workspaces.prolific).
 *
 * Workshop and tutorial IDs ARE attached (see `useModeContext`). They identify
 * a cohort, not a person — many participants share one — and they're what
 * makes "which tools/models does a workshop actually use" answerable in
 * PostHog rather than only by exporting the DB.
 *
 * Prompt text is never sent — capture `prompt_length` and the `chart_id`; the
 * full prompt lives in the Postgres config row, joinable via `chart_id`.
 *
 * Run lifecycle (`run_submitted` / `run_completed` / `run_failed`) is NOT
 * emitted from components. It lives in the React Query mutation hooks in
 * `lib/api/*.ts` — see `useTrackRun` below for why.
 */

/**
 * The interpretability tools, tagged on every tool event via `tool`.
 *
 * These are analytics LABELS, deliberately decoupled from `WorkshopTool` — the
 * DB gating vocabulary in `workshops.allowedTools`, which doubles as the route
 * segment and calls this tool "lens2". That's an internal codename; the
 * product name is Logit Lens (see `ChartCard.tsx`'s label map), and a dashboard
 * breakdown should read the product name. The other tools already match
 * theirs, so only this one is translated.
 *
 * j-lens and generation aren't workshop-gated but still emit run events. The
 * legacy lens v1 is deliberately absent — hidden tool, runs stay untracked.
 */
export type Tool = "Logit Lens" | "activation-patching" | "patch-lens" | "j-lens" | "generation";

export type AnalyticsEvent =
    | "tool_opened"
    | "chart_created"
    | "chart_converted"
    | "run_submitted"
    | "run_completed"
    | "run_failed"
    | "param_changed"
    | "cell_expanded"
    | "patch_lens_intervention_applied"
    | "patch_lens_intervention_reset"
    | "run_restored";

/**
 * Which product surface an event happened in.
 *
 * `tutorial` and `workshop` are not independent — the guided tutorial only
 * runs inside a workshop. `mode` reports the most specific one so a single
 * breakdown separates the three populations; `tutorial_active` is emitted
 * alongside it so workshop totals can still be rolled up (filter on
 * `workshop_id is set` rather than `mode = workshop`).
 */
export type AnalyticsMode = "main" | "workshop" | "tutorial";

type EventProperties = Record<string, unknown>;

/**
 * Workshop / tutorial identity for the current workspace.
 *
 * The one query used here is already warm in a workshop session (the shell
 * reads the same workshop for tool gating and model pinning), so this adds no
 * fetch. The tutorial id rides along on the workshop row rather than costing a
 * second round-trip — `resolveTutorialForWorkspace` returns only the content
 * blob (version + units), which carries no id or name anyway.
 *
 * Only ids and the workshop's name go out. The tutorial's display name is a
 * DB join on `tutorial_id`, matching how Prolific identities are handled.
 */
function useModeContext(workspaceId: string | undefined): EventProperties {
    const { data: workshop } = useWorkspaceWorkshop(workspaceId);
    // Safe outside the provider — returns a no-op emitter with isOpen: false.
    const { isOpen: tutorialActive } = useTutorialEmit();

    const workshopId = workshop?.id;
    const workshopSlug = workshop?.slug;
    const workshopName = workshop?.name;
    // A workshop with no assigned tutorial runs the seeded demo. Reporting it
    // as "demo" rather than undefined keeps those sessions visible in a
    // tutorial_id breakdown instead of silently dropping out.
    const tutorialId = workshop ? (workshop.tutorialId ?? "demo") : undefined;

    // Memoized on primitives so `useCapture`'s callback identity is stable
    // across renders that don't change the context.
    return useMemo(() => {
        const mode: AnalyticsMode = tutorialActive ? "tutorial" : workshopId ? "workshop" : "main";
        return {
            mode,
            tutorial_active: tutorialActive,
            // Undefined properties are dropped on serialization, so a main-app
            // run simply carries no workshop_*/tutorial_* keys.
            workshop_id: workshopId,
            workshop_slug: workshopSlug,
            workshop_name: workshopName,
            tutorial_id: tutorialId,
        };
    }, [tutorialActive, workshopId, workshopSlug, workshopName, tutorialId]);
}

/**
 * Returns a `capture(event, props)` function that merges the current route's
 * `workspace_id`/`chart_id` and the workshop/tutorial context into every
 * event, so call sites only pass the event-specific properties. No-op until
 * PostHog is initialized (e.g. when `NEXT_PUBLIC_POSTHOG_KEY` is unset
 * locally).
 */
export function useCapture() {
    const posthog = usePostHog();
    const params = useParams();
    const workspaceId = typeof params?.workspaceId === "string" ? params.workspaceId : undefined;
    const chartId = typeof params?.chartId === "string" ? params.chartId : undefined;
    const mode = useModeContext(workspaceId);

    return useCallback(
        (event: AnalyticsEvent, properties?: EventProperties) => {
            if (!posthog?.__loaded) return;
            posthog.capture(event, {
                workspace_id: workspaceId,
                chart_id: chartId,
                ...mode,
                ...properties,
            });
        },
        [posthog, workspaceId, chartId, mode],
    );
}

export interface RunProps extends EventProperties {
    tool: Tool;
    model?: string | null;
}

/**
 * Correlation id shared by the three events of one run.
 *
 * Without it the events have no unique key — `distinct_id` + `chart_id` +
 * `tool` can't separate two runs on the same chart seconds apart (the
 * chart-open auto-run followed by a Run press), so pairing a completion back
 * to its submission would be a timestamp heuristic.
 *
 * `crypto.randomUUID` is undefined outside secure contexts (a plain-http
 * preview host), and a throw in here would break the run itself rather than
 * just its telemetry — hence the fallback.
 */
function newRunId(): string {
    return (
        globalThis.crypto?.randomUUID?.() ??
        `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    );
}

/**
 * Wraps one logical run with its `run_submitted` → `run_completed`/`run_failed`
 * pair and a `duration_ms`.
 *
 * Call this from the `mutationFn` of a run mutation in `lib/api/*.ts`, NOT
 * from components. Two reasons the mutation layer is the right seam:
 *
 *  - One mutation is exactly one user-initiated run. `startAndPoll` is a
 *    tempting single choke point but sits a level too low: a patch-lens run
 *    issues two parallel `startAndPoll` calls (source + target prompt), which
 *    would double-count runs and halve `duration_ms`.
 *  - `/logit_lens/start` is shared by lens2 AND patch-lens, so the endpoint
 *    can't name the tool. The mutation can.
 *
 * Emitting here also means a new tool is instrumented by the act of getting a
 * mutation hook — which is how j-lens and generation, previously invisible,
 * started reporting.
 *
 * `duration_ms` is wall-clock as the user perceives it, so it includes NDIF
 * queue time. Splitting queue from compute needs per-request timings threaded
 * up out of `startAndPoll`; not done here.
 *
 * All three events carry the tool's params and a shared `run_id`. The params
 * are redundant with `run_submitted` on purpose: PostHog Trends can't join
 * events, so "p95 duration by prompt_length" or "failure rate by topk" need
 * the param sitting on the outcome event. `run_id` is what makes that
 * redundancy a convenience rather than the only option — it pairs the events
 * exactly, for funnels and drop-off.
 */
export function useTrackRun() {
    const capture = useCapture();

    return useCallback(
        async <T>(props: RunProps, run: () => Promise<T>): Promise<T> => {
            const base = { ...props, run_id: newRunId() };
            const startedAt = Date.now();
            capture("run_submitted", base);
            try {
                const data = await run();
                capture("run_completed", { ...base, duration_ms: Date.now() - startedAt });
                return data;
            } catch (error) {
                capture("run_failed", {
                    ...base,
                    duration_ms: Date.now() - startedAt,
                    error: String(error),
                });
                throw error;
            }
        },
        [capture],
    );
}
