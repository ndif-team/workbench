"use client";

import { useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import posthog from "posthog-js";
import { usePostHog } from "posthog-js/react";
import { useWorkspaceScope } from "@/components/providers/WorkspaceScopeProvider";
import { useTutorialEmit } from "@/components/providers/TutorialEventProvider";
import { useWorkspaceWorkshop } from "@/lib/api/workshopApi";
import { errorTypeOf, ndifJobIdOf } from "@/lib/ndifError";
import type { JobRecord, JobSink } from "@/lib/ndifJob";
import { normalizeToolType, type ToolType } from "@/types/charts";
import type { WorkspaceScope } from "@/types/workspaces";

/**
 * Product analytics. The single place event names live.
 *
 * Correlation model: every event's `distinct_id` is the Supabase user (set by
 * identify in `provider.tsx`), the only participant identifier PostHog holds.
 * Prolific IDs are never attached; tying an event to a Prolific participant is
 * an offline DB join on the user id (app_metadata / workspaces.prolific).
 * Workshop and tutorial ids are attached (`useModeContext`): they identify a
 * cohort, not a person.
 *
 * User-authored text never goes out: not prompts (send `prompt_length`; the
 * prompt lives in the config row, joinable via `chart_id`), not chart, report
 * or workspace names (send a length), not report content or notes.
 *
 * Run lifecycle (`run_submitted` / `run_completed` / `run_failed`) is emitted
 * by `useTrackRun` from the run mutations in `lib/api/*.ts`, not from
 * components. Other events are emitted once per completed user action, after
 * it succeeded, from the mutation hook that performs it where there is one, so
 * every surface that offers the action is counted the same way.
 */
type AnalyticsEvent =
    // Tools
    | "tool_opened"
    | "run_submitted"
    | "run_completed"
    | "run_failed"
    | "run_restored"
    | "param_changed"
    | "cell_expanded"
    | "patch_lens_intervention_applied"
    | "patch_lens_intervention_reset"
    // Getting to a chart: the landing page and Home's composer, the Discover
    // J-Lens launch, the models page's launch dialog, and cold-model warmups
    | "landing_submission"
    | "jlens_discovery"
    | "model_launch"
    | "model_warmup_started"
    | "model_warmup_completed"
    | "model_warmup_failed"
    | "chart_created"
    // Charts, reports and workspaces. Reports have no rename (their title is
    // their first line) and no copy.
    | "chart_renamed"
    | "chart_copied"
    | "chart_moved"
    | "chart_deleted"
    | "chart_exported"
    | "chart_embedded"
    | "report_created"
    | "report_moved"
    | "report_deleted"
    | "report_exported"
    | "workspace_created"
    | "workspace_renamed"
    | "workspace_deleted"
    | "workspace_view_changed"
    | "searched"
    // Guided tutorial; never participant text
    | "tutorial_glossary_opened"
    | "tutorial_notes_opened"
    | "tutorial_welcome_slide_shown"
    | "tutorial_welcome_dismissed";

/**
 * Which surface an event happened in: the main app, a workshop workspace, or
 * the guided tutorial (which only runs inside a workshop). `mode` reports the
 * most specific one; filter on `workshop_id is set` to roll workshops up.
 */
type AnalyticsMode = "main" | "workshop" | "tutorial";

type EventProperties = Record<string, unknown>;

/**
 * The `tool` label every event carries: the chart's tool type, with legacy
 * aliases (`lens2`) mapped to their current name. Unknown values pass through.
 */
export function normalizeTool(raw: string | null | undefined): string | undefined {
    return normalizeToolType(raw) ?? undefined;
}

/**
 * Workshop and tutorial identity for the current workspace. Only fetched for a
 * workshop workspace, whose pages already load the same workshop for tool
 * gating and model pinning. A workshop with no tutorial of its own runs the
 * seeded demo, reported as `"demo"`.
 */
function useModeContext(scope: WorkspaceScope | null): EventProperties {
    const workshopId = scope?.workshopId ?? undefined;
    const { data: workshop } = useWorkspaceWorkshop(workshopId ? scope?.workspaceId : undefined);
    const { isOpen: tutorialActive } = useTutorialEmit();

    const workshopSlug = workshop?.slug;
    const workshopName = workshop?.name;
    const tutorialId = workshopId ? (workshop?.tutorialId ?? "demo") : undefined;

    return useMemo(() => {
        const mode: AnalyticsMode = tutorialActive ? "tutorial" : workshopId ? "workshop" : "main";
        return {
            mode,
            tutorial_active: tutorialActive,
            workshop_id: workshopId,
            workshop_slug: workshopSlug,
            workshop_name: workshopName,
            tutorial_id: tutorialId,
        };
    }, [tutorialActive, workshopId, workshopSlug, workshopName, tutorialId]);
}

/**
 * Returns a `capture(event, props)` that merges the current `workspace_id`
 * (from the workspace scope, absent outside chart and report pages), the
 * route's `chart_id` / `report_id`, and the workshop context into every event,
 * so call sites pass only the event's own properties. An event that names its
 * own item (passes any of those ids) gets none of the route's, so deleting a
 * report from the sidebar on a chart page doesn't carry that chart's id. No-op
 * until PostHog is initialized (e.g. when `NEXT_PUBLIC_POSTHOG_KEY` is unset).
 */
export function useCapture() {
    const posthog = usePostHog();
    const params = useParams();
    const scope = useWorkspaceScope();
    const workspaceId = scope?.workspaceId;
    const chartId = typeof params?.chartId === "string" ? params.chartId : undefined;
    const reportId = typeof params?.reportId === "string" ? params.reportId : undefined;
    const mode = useModeContext(scope);

    return useCallback(
        (event: AnalyticsEvent, properties?: EventProperties) => {
            if (!posthog?.__loaded) return;
            const ownItem = ["workspace_id", "chart_id", "report_id"].some(
                (key) => properties?.[key] !== undefined,
            );
            posthog.capture(event, {
                ...(ownItem
                    ? {}
                    : { workspace_id: workspaceId, chart_id: chartId, report_id: reportId }),
                ...mode,
                ...properties,
            });
        },
        [posthog, workspaceId, chartId, reportId, mode],
    );
}

/**
 * `capture` for code outside React (a store, a module-level helper), without
 * the route and workshop context `useCapture` adds. Prefer `useCapture`.
 */
export function captureEvent(event: AnalyticsEvent, properties?: EventProperties) {
    if (!posthog.__loaded) return;
    posthog.capture(event, properties);
}

/** What started a run: `launch`, the run a chart starts as it opens with a
 * saved prompt and no result (a launch from Home); `run`, a Run press. */
export type RunTrigger = "launch" | "run";

interface RunProps extends EventProperties {
    tool: ToolType;
    model?: string | null;
    trigger?: RunTrigger;
}

/**
 * Wraps one logical run with its `run_submitted` → `run_completed` /
 * `run_failed` pair.
 *
 * Call it from the `mutationFn` of a run mutation in `lib/api/*.ts`, not from
 * components: one mutation is exactly one user-initiated run, where the NDIF
 * helpers below it are too low (a Patch Lens run issues two parallel lens
 * requests, and one endpoint serves several tools). A new tool is instrumented
 * by the act of getting a run mutation.
 *
 * All three events carry the run's props and a shared `run_id`, since PostHog
 * Trends can't join events: "failure rate by model" needs the model on
 * `run_failed`. `duration_ms` is wall-clock as the user waits, queue included;
 * the job sink handed to `run` brings back the NDIF job ids and queue and job
 * times (`jobProperties`). `run_failed` adds `error_type`, the exception class,
 * for breakdowns, and the message as `error`.
 */
export function useTrackRun() {
    const capture = useCapture();

    return useCallback(
        async <T>(props: RunProps, run: (jobs: JobSink) => Promise<T>): Promise<T> => {
            const jobs: JobSink = [];
            const base = { ...props, run_id: TrackedRun.newId() };
            const startedAt = Date.now();
            capture("run_submitted", base);
            try {
                const data = await run(jobs);
                capture("run_completed", {
                    ...base,
                    duration_ms: Date.now() - startedAt,
                    ...TrackedRun.jobProperties(jobs),
                });
                return data;
            } catch (error) {
                const fromJobs = TrackedRun.jobProperties(jobs);
                capture("run_failed", {
                    ...base,
                    duration_ms: Date.now() - startedAt,
                    error_type: errorTypeOf(error),
                    ...fromJobs,
                    ndif_job_id: fromJobs.ndif_job_id ?? ndifJobIdOf(error) ?? undefined,
                    error: TrackedRun.errorMessage(error),
                });
                throw error;
            }
        },
        [capture],
    );
}

/** The parts of a tracked run's events that don't depend on the tool. */
class TrackedRun {
    /**
     * The id shared by one run's three events, which `distinct_id` + `chart_id`
     * can't tell apart from a second run on the same chart seconds later.
     * `crypto.randomUUID` is missing outside secure contexts (a plain-http
     * preview host), hence the fallback: a throw here would fail the run.
     */
    static newId(): string {
        return (
            globalThis.crypto?.randomUUID?.() ??
            `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
        );
    }

    /**
     * A failed run's message for `run_failed`: its first line, capped, with
     * long quoted text elided, since a tool's error can quote the prompt.
     */
    static errorMessage(error: unknown): string {
        const first = String(error).split("\n", 1)[0];
        return first.replace(/(["'`])(?:(?!\1).){25,}\1/g, "$1…$1").slice(0, 200);
    }

    /**
     * The jobs a run dispatched, as event properties: `ndif_job_id` (the
     * first), `ndif_job_ids` when there were several, and the slowest job's
     * `queue_wait_ms` and `job_total_ms`, since parallel jobs overlap.
     */
    static jobProperties(jobs: JobSink): EventProperties {
        if (jobs.length === 0) return {};
        const maxOf = (pick: (j: JobRecord) => number | null): number | undefined => {
            const values = jobs.map(pick).filter((ms): ms is number => typeof ms === "number");
            return values.length > 0 ? Math.max(...values) : undefined;
        };
        return {
            ndif_job_id: jobs[0].jobId,
            ndif_job_ids: jobs.length > 1 ? jobs.map((j) => j.jobId) : undefined,
            queue_wait_ms: maxOf((j) => j.queueWaitMs),
            job_total_ms: maxOf((j) => j.totalMs),
        };
    }
}
