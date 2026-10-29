"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createChartFromLaunch } from "@/lib/queries/chartQueries";
import { toolChartPath } from "@/lib/chartRoutes";
import { getPendingRequest, pendingRequestPath } from "@/lib/pendingRequest";
import { queryKeys } from "@/lib/queryKeys";
import type { ChartLaunchRequest } from "@/lib/chartLaunch";
import { PageHeader } from "../../components/shell/PageHeader";

/**
 * Creates the chart a `/new` URL describes, then replaces the URL with the
 * chart's page. A launch still waiting on sign-in takes precedence over the
 * URL's own request (see `PendingRequestHandler`). Remount it (via `key`) for
 * a different request.
 */
export function NewChartCreator({ request }: { request: ChartLaunchRequest }) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    // Guards against the effect re-running for the same attempt (strict mode).
    const startedAttemptRef = useRef<number | null>(null);

    useEffect(() => {
        if (startedAttemptRef.current === attempt) return;
        startedAttemptRef.current = attempt;

        const pendingRequest = getPendingRequest();
        if (pendingRequest) {
            router.replace(pendingRequestPath(pendingRequest));
            return;
        }

        setFailed(false);
        createChartFromLaunch(request)
            .then(({ chartId, toolType, workspaceId }) => {
                queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.library });
                queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
                queryClient.invalidateQueries({ queryKey: queryKeys.charts.sidebar(workspaceId) });
                router.replace(toolChartPath(chartId, toolType));
            })
            .catch((err) => {
                console.error("Failed to create chart:", err);
                setFailed(true);
            });
    }, [attempt, request, router, queryClient]);

    return (
        <div className="flex size-full min-h-0 flex-col">
            <PageHeader />
            {failed ? (
                <div className="flex flex-1 items-center justify-center p-4" role="alert">
                    <div className="flex flex-col items-center gap-3 text-center">
                        <p className="text-sm text-muted-foreground">
                            Couldn&apos;t create the chart.
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setAttempt((n) => n + 1)}
                        >
                            Try again
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-1 items-center justify-center p-4" aria-live="polite">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating chart…
                    </div>
                </div>
            )}
        </div>
    );
}
