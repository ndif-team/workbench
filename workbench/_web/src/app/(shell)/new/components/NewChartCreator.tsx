"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useCaptureLaunchedChart } from "@/hooks/useLaunchChart";
import { useCreateChartFromLaunch } from "@/lib/api/chartApi";
import { toolChartPath } from "@/lib/chartRoutes";
import { getPendingRequest, pendingRequestPath } from "@/lib/pendingRequest";
import {
    ChartOrigins,
    isBlankPlan,
    planChartLaunch,
    type ChartLaunchRequest,
    type ChartOrigin,
} from "@/lib/chartLaunch";
import { usePromptFocus } from "@/stores/usePromptFocus";
import { PageHeader } from "../../components/shell/PageHeader";
import { PendingChartPage } from "../../components/shell/PendingChartPage";

/**
 * Creates the chart a `/new` URL describes, showing its empty page meanwhile
 * (`PendingChartPage`), then replaces the URL with the chart's page; a blank
 * chart opens with its prompt focused (`usePromptFocus`). A launch still
 * waiting on sign-in takes precedence over the URL's own request (see
 * `PendingRequestHandler`). Remount it (via `key`) for a different request.
 * Launches from inside the app skip this page (`useLaunchChart`). `origin` is
 * the surface that sent the user here, for `chart_created`.
 *
 * It follows the mutation's promise rather than per-call `mutate` callbacks:
 * those are dropped when the observer unsubscribes, which strict mode's
 * mount-unmount-mount does right after the effect has started the request.
 */
export function NewChartCreator({
    request,
    origin,
}: {
    request: ChartLaunchRequest;
    origin: ChartOrigin;
}) {
    const router = useRouter();
    const { mutateAsync: createChart } = useCreateChartFromLaunch();
    const captureLaunched = useCaptureLaunchedChart();
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    // Guards against the effect re-running for the same attempt (strict mode).
    const startedAttemptRef = useRef<number | null>(null);

    useEffect(() => {
        if (startedAttemptRef.current === attempt) return;
        startedAttemptRef.current = attempt;

        const pendingRequest = getPendingRequest();
        if (pendingRequest) {
            router.replace(ChartOrigins.tag(pendingRequestPath(pendingRequest), "resumed"));
            return;
        }

        setFailed(false);
        createChart(request).then(
            (launched) => {
                const blank = isBlankPlan(planChartLaunch(request));
                captureLaunched(launched, origin, blank);
                if (blank) usePromptFocus.getState().request(launched.chartId);
                router.replace(toolChartPath(launched.chartId, launched.toolType));
            },
            (err) => {
                console.error("Failed to create chart:", err);
                setFailed(true);
            },
        );
    }, [attempt, request, origin, router, createChart, captureLaunched]);

    if (!failed) return <PendingChartPage request={request} />;

    return (
        <div className="flex size-full min-h-0 flex-col">
            <PageHeader />
            <div className="flex flex-1 items-center justify-center p-4" role="alert">
                <div className="flex flex-col items-center gap-3 text-center">
                    <p className="text-sm text-muted-foreground">Couldn&apos;t create the chart.</p>
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
        </div>
    );
}
