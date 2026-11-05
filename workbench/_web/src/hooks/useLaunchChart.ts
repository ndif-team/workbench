import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useCreateChartFromLaunch } from "@/lib/api/chartApi";
import { chartLaunchFromSearchParams, isBlankPlan, planChartLaunch } from "@/lib/chartLaunch";
import { toolChartPath } from "@/lib/chartRoutes";
import { usePendingChart } from "@/stores/usePendingChart";
import { usePromptFocus } from "@/stores/usePromptFocus";

/**
 * Starts a chart from inside the app, from the parameters a `/new` URL takes
 * (`newChartPath`), without loading that page. The shell shows the chart's
 * empty page at once (`usePendingChart`) while the chart is created, then its
 * page opens on the rows the creation cached (`useCreateChartFromLaunch`); a
 * blank chart opens with its prompt focused. A chart whose user went
 * elsewhere meanwhile is still created, but not opened.
 */
export function useLaunchChart() {
    const router = useRouter();
    const { mutateAsync: createChart } = useCreateChartFromLaunch();

    return useCallback(
        (params: ConstructorParameters<typeof URLSearchParams>[0]) => {
            const request = chartLaunchFromSearchParams(
                Object.fromEntries(new URLSearchParams(params)),
            );
            const launch = usePendingChart
                .getState()
                .start({ request, from: window.location.pathname });
            createChart(request).then(
                ({ chartId, toolType }) => {
                    if (usePendingChart.getState().pending?.id !== launch) return;
                    const path = toolChartPath(chartId, toolType);
                    // Reopening the blank chart on screen changes no page to end the launch.
                    const stays = path === window.location.pathname;
                    if (stays) usePendingChart.getState().clear(launch);
                    if (isBlankPlan(planChartLaunch(request))) {
                        usePromptFocus.getState().request(chartId);
                    }
                    if (!stays) router.push(path);
                },
                (err) => {
                    console.error("Failed to create chart:", err);
                    usePendingChart.getState().clear(launch);
                    toast.error("Couldn't create the chart");
                },
            );
        },
        [router, createChart],
    );
}
