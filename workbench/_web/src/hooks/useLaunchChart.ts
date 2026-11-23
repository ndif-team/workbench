import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useCapture } from "@/lib/analytics";
import { useCreateChartFromLaunch } from "@/lib/api/chartApi";
import {
    chartLaunchFromSearchParams,
    isBlankPlan,
    planChartLaunch,
    type ChartOrigin,
} from "@/lib/chartLaunch";
import { toolChartPath } from "@/lib/chartRoutes";
import type { LaunchedChart } from "@/lib/queries/chartDb";
import { usePendingItem } from "@/stores/usePendingItem";
import { usePromptFocus } from "@/stores/usePromptFocus";

/**
 * Starts a chart from inside the app, from the parameters a `/new` URL takes
 * (`newChartPath`), without loading that page. The shell shows the chart's
 * empty page at once (`usePendingItem`) while the chart is created, then its
 * page opens on the rows the creation cached (`useCreateChartFromLaunch`); a
 * blank chart opens with its prompt focused. A chart whose user went
 * elsewhere meanwhile is still created, but not opened. `origin` names the
 * surface the launch came from, for `chart_created`.
 */
export function useLaunchChart() {
    const router = useRouter();
    const { mutateAsync: createChart } = useCreateChartFromLaunch();
    const captureLaunched = useCaptureLaunchedChart();

    return useCallback(
        (params: ConstructorParameters<typeof URLSearchParams>[0], origin: ChartOrigin) => {
            const request = chartLaunchFromSearchParams(
                Object.fromEntries(new URLSearchParams(params)),
            );
            const launch = usePendingItem
                .getState()
                .start({ kind: "chart", request, from: window.location.pathname });
            createChart(request).then(
                (launched) => {
                    const blank = isBlankPlan(planChartLaunch(request));
                    captureLaunched(launched, origin, blank);
                    if (usePendingItem.getState().pending?.id !== launch) return;
                    const path = toolChartPath(launched.chartId, launched.toolType);
                    // Reopening the blank chart on screen changes no page to end the launch.
                    const stays = path === window.location.pathname;
                    if (stays) usePendingItem.getState().clear(launch);
                    if (blank) usePromptFocus.getState().request(launched.chartId);
                    if (!stays) router.push(path);
                },
                (err) => {
                    console.error("Failed to create chart:", err);
                    usePendingItem.getState().clear(launch);
                    toast.error("Couldn't create the chart");
                },
            );
        },
        [router, createChart, captureLaunched],
    );
}

/**
 * Reports `chart_created` for a launch the server answered, with the new
 * chart's id and workspace in place of the launching page's. `blank` is
 * whether the launch asked for nothing but a tool (`isBlankPlan`). Call it
 * from the creation's promise, which settles even after the launching
 * component unmounts, unlike per-call `mutate` callbacks.
 */
export function useCaptureLaunchedChart() {
    const capture = useCapture();

    return useCallback(
        (launched: LaunchedChart, origin: ChartOrigin, blank: boolean) =>
            capture("chart_created", {
                tool: launched.toolType,
                origin,
                reused: launched.reused,
                has_prompt: !blank,
                chart_id: launched.chartId,
                workspace_id: launched.workspaceId,
            }),
        [capture],
    );
}
