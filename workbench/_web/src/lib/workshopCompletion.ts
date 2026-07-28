import type { WorkshopAnalytics } from "@/lib/queries/workshopAnalyticsDb";

/**
 * Tutorial completion % = participants who completed the canonical final unit ÷
 * participants who started the canonical first unit. Uses the canonical
 * first/last step ids (not funnel positions), so a first unit with missing
 * telemetry can't shrink the denominator and overstate completion.
 *
 * Lives in its own DB-free module (only a `import type` of the analytics shape)
 * so the client stat tile can call it without pulling the Node DB client into
 * the browser bundle.
 */
export const tutorialCompletionPct = (analytics: WorkshopAnalytics): number => {
    const { funnel, firstStepId, finalStepId } = analytics.tutorial;
    if (funnel.length === 0) return 0;
    const firstRow = firstStepId ? funnel.find((f) => f.stepId === firstStepId) : funnel[0];
    const firstStarted = firstRow?.started ?? 0;
    if (firstStarted === 0) return 0;
    const finalRow = finalStepId ? funnel.find((f) => f.stepId === finalStepId) : undefined;
    const finalCompleted = finalRow?.completed ?? 0;
    return Math.round((finalCompleted / firstStarted) * 100);
};
