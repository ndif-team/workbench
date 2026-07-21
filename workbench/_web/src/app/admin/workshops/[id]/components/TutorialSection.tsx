"use client";

import type { WorkshopAnalytics } from "@/lib/queries/workshopAnalyticsDb";
import { TUTORIAL_STEP_LABELS, type TutorialStepId } from "@/tutorials/prolificSteps";

const stepLabel = (stepId: string) => TUTORIAL_STEP_LABELS[stepId as TutorialStepId] ?? stepId;

/**
 * Per-step started→completed funnel (plain bars — no chart lib needed) plus the
 * observations list grouped by step. Observation text is app-DB-only research
 * data; admins-only surface.
 */
export function TutorialSection({ analytics }: { analytics: WorkshopAnalytics }) {
    const { funnel, observations, checkStats } = analytics.tutorial;
    const maxStarted = Math.max(1, ...funnel.map((f) => f.started));

    const byStep = new Map<string, typeof observations>();
    for (const o of observations) {
        if (!byStep.has(o.stepId)) byStep.set(o.stepId, []);
        byStep.get(o.stepId)!.push(o);
    }

    return (
        <div className="rounded-md border bg-card shadow-xs">
            <div className="border-b p-3">
                <h3 className="pl-1 text-sm font-medium">Tutorial progress</h3>
            </div>

            <div className="p-4">
                {funnel.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No tutorial activity yet.</p>
                ) : (
                    <div className="flex flex-col gap-3">
                        {funnel.map((f) => (
                            <div key={f.stepId} className="flex items-center gap-3">
                                <div className="w-40 shrink-0 truncate text-sm">
                                    {stepLabel(f.stepId)}
                                </div>
                                <div className="relative h-5 flex-1 overflow-hidden rounded bg-secondary/60">
                                    {/* started (light) with completed (primary) overlaid */}
                                    <div
                                        className="absolute inset-y-0 left-0 bg-muted-foreground/25"
                                        style={{ width: `${(f.started / maxStarted) * 100}%` }}
                                    />
                                    <div
                                        className="absolute inset-y-0 left-0 bg-primary/70"
                                        style={{ width: `${(f.completed / maxStarted) * 100}%` }}
                                    />
                                </div>
                                <div className="w-24 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                                    {f.completed}/{f.started}
                                </div>
                            </div>
                        ))}
                        <p className="text-xs text-muted-foreground">
                            Bars show started (light) vs completed (blue) per unit.
                        </p>
                    </div>
                )}
            </div>

            {checkStats.length > 0 && (
                <div className="border-t p-4">
                    <h4 className="mb-2 text-sm font-medium">Embedded checks</h4>
                    <div className="flex flex-col gap-2">
                        {checkStats.map((c) => (
                            <div key={c.stepId} className="flex items-center gap-3">
                                <div className="w-40 shrink-0 truncate text-sm">
                                    {stepLabel(c.stepId)}
                                </div>
                                <div className="relative h-5 flex-1 overflow-hidden rounded bg-secondary/60">
                                    <div
                                        className="absolute inset-y-0 left-0 bg-primary/70"
                                        style={{
                                            width: `${(c.correct / Math.max(1, c.answered)) * 100}%`,
                                        }}
                                    />
                                </div>
                                <div className="w-24 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                                    {c.correct}/{c.answered} correct
                                </div>
                            </div>
                        ))}
                        <p className="text-xs text-muted-foreground">
                            Share of participants whose check answer matched their own run.
                        </p>
                    </div>
                </div>
            )}

            {observations.length > 0 && (
                <div className="border-t p-4">
                    <h4 className="mb-2 text-sm font-medium">Observations</h4>
                    <div className="flex flex-col gap-3">
                        {[...byStep.entries()].map(([stepId, rows]) => (
                            <div key={stepId}>
                                <p className="text-xs font-medium text-muted-foreground">
                                    {stepLabel(stepId)}
                                </p>
                                <ul className="mt-1 flex flex-col gap-1">
                                    {rows.map((o, i) => (
                                        <li
                                            key={`${o.workspaceId}-${i}`}
                                            className="rounded border-l-2 border-border pl-2 text-sm"
                                        >
                                            {o.text}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
