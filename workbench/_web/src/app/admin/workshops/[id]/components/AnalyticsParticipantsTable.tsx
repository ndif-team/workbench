"use client";

import type { ParticipantAnalyticsRow } from "@/lib/queries/workshopAnalyticsDb";
import { TUTORIAL_STEP_LABELS, type TutorialStepId } from "@/tutorials/prolificSteps";
import { splitRepo } from "@/components/model-selector/status";

const formatWhen = (d: Date) =>
    new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Per-participant rollup. Truncated uid is the identifier (participants are anon). */
export function AnalyticsParticipantsTable({
    participants,
    stepLabels,
}: {
    participants: ParticipantAnalyticsRow[];
    stepLabels: Record<string, string>;
}) {
    // Prefer the workshop tutorial's own unit titles; fall back to the demo id
    // map, then the raw id, so custom/edited tutorials aren't left unlabeled.
    const stepLabel = (stepId: string | null) =>
        stepId ? (stepLabels[stepId] ?? TUTORIAL_STEP_LABELS[stepId as TutorialStepId] ?? stepId) : "—";

    return (
        <div className="rounded-md border bg-card shadow-xs">
            <div className="border-b p-3">
                <h3 className="pl-1 text-sm font-medium">Participants</h3>
            </div>
            {participants.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No participants yet.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-muted-foreground">
                            <tr className="border-b [&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
                                <th>Participant</th>
                                <th>Prolific</th>
                                <th className="text-right">Charts</th>
                                <th className="text-right">Runs</th>
                                <th>Models</th>
                                <th>Furthest step</th>
                                <th className="text-right">Hints</th>
                                <th>Last active</th>
                            </tr>
                        </thead>
                        <tbody>
                            {participants.map((p) => (
                                <tr
                                    key={p.workspaceId}
                                    className="border-b last:border-0 [&>td]:px-3 [&>td]:py-2"
                                >
                                    <td className="font-mono text-xs">{p.userIdShort}</td>
                                    <td className="font-mono text-xs">{p.prolificPid ?? "—"}</td>
                                    <td className="text-right font-mono tabular-nums">
                                        {p.charts}
                                    </td>
                                    <td className="text-right font-mono tabular-nums">
                                        {p.lensRuns}
                                    </td>
                                    <td className="max-w-[14rem] truncate">
                                        {p.modelsUsed.length === 0
                                            ? "—"
                                            : p.modelsUsed
                                                  .map((m) => splitRepo(m).label)
                                                  .join(", ")}
                                    </td>
                                    <td>{stepLabel(p.furthestStepId)}</td>
                                    <td className="text-right font-mono tabular-nums">
                                        {p.hintsUsed}
                                    </td>
                                    <td className="whitespace-nowrap text-muted-foreground tabular-nums">
                                        {formatWhen(p.lastActiveAt)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
