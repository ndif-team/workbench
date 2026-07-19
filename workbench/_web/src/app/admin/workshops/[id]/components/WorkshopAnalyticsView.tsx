"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Link2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useWorkshops, useWorkshopAnalytics } from "@/lib/api/workshopApi";
import { copyWorkshopJoinLink } from "@/lib/workshopLink";
import { splitRepo } from "@/components/model-selector/status";
import { AnalyticsStatTiles } from "./AnalyticsStatTiles";
import { AnalyticsTimeSeries } from "./AnalyticsTimeSeries";
import { AnalyticsParticipantsTable } from "./AnalyticsParticipantsTable";
import { TutorialSection } from "./TutorialSection";
import { ExportCsvButton } from "./ExportCsvButton";

const formatExpiry = (expiresAt: Date) =>
    new Date(expiresAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * Container for the per-workshop analytics dashboard. Reads the analytics
 * rollup (admin-guarded) and reuses the cached workshops list for the header
 * meta (name/model/expiry/join-link) rather than adding a getWorkshopById RPC.
 */
export function WorkshopAnalyticsView({ workshopId }: { workshopId: string }) {
    const { data: workshops } = useWorkshops();
    const { data: analytics, isLoading, isError } = useWorkshopAnalytics(workshopId);

    const workshop = useMemo(
        () => workshops?.find((w) => w.id === workshopId),
        [workshops, workshopId],
    );

    return (
        <div className="flex flex-col gap-4 pt-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <Link
                        href="/admin/workshops"
                        className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Workshops
                    </Link>
                    <h2 className="truncate text-lg font-semibold">
                        {workshop?.name ?? "Workshop analytics"}
                    </h2>
                    {workshop && (
                        <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                            <span className="font-mono text-xs" title={workshop.model}>
                                {splitRepo(workshop.model).label}
                            </span>
                            {" · "}
                            Expires {formatExpiry(workshop.expiresAt)}
                        </p>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {workshop && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground/40 hover:text-foreground"
                            title="Copy join link"
                            onClick={() => copyWorkshopJoinLink(workshop.slug)}
                        >
                            <Link2 className="h-4 w-4" />
                        </Button>
                    )}
                    <ExportCsvButton
                        workshopId={workshopId}
                        workshopName={workshop?.name ?? workshopId}
                    />
                </div>
            </div>

            {isLoading && (
                <div
                    aria-live="polite"
                    className="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground"
                >
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading analytics…
                </div>
            )}

            {isError && (
                <div className="rounded-md border p-4 text-sm text-destructive">
                    Could not load analytics for this workshop.
                </div>
            )}

            {analytics && (
                <>
                    <AnalyticsStatTiles analytics={analytics} />
                    <AnalyticsTimeSeries
                        joinsPerDay={analytics.series.joinsPerDay}
                        runsPerDay={analytics.series.runsPerDay}
                    />
                    <TutorialSection analytics={analytics} />
                    <AnalyticsParticipantsTable participants={analytics.participants} />
                </>
            )}
        </div>
    );
}
