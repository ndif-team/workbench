"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useCaptureLaunchedChart } from "@/hooks/useLaunchChart";
import { useCreateChartFromLaunch } from "@/lib/api/chartApi";
import { toolChartPath } from "@/lib/chartRoutes";
import { resumePendingRequest } from "@/lib/pendingRequest";
import {
    isBlankPlan,
    planChartLaunch,
    type ChartLaunchRequest,
    type ChartOrigin,
} from "@/lib/chartLaunch";
import { usePromptFocus } from "@/stores/usePromptFocus";
import { PendingChartPage } from "../../components/shell/PendingChartPage";
import { LaunchFailed } from "./LaunchFailed";

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

        if (resumePendingRequest(router)) return;

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
        <LaunchFailed
            message="Couldn't create the chart."
            onRetry={() => setAttempt((n) => n + 1)}
        />
    );
}
