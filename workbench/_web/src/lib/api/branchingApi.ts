/**
 * Researcher-mode Branching Generations client. Hits the synchronous
 * /branching/* endpoints (the backend polls NDIF internally), so no
 * startAndPoll dance — just a direct fetch.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import config from "@/lib/config";
import { setChartData } from "@/lib/queries/chartQueries";
import { createUserHeadersAction } from "@/actions/auth";
import { queryKeys } from "@/lib/queryKeys";
import type {
    BranchingConfigData,
    BranchingChartData,
} from "@/types/branching";
import type { BranchingSample, BranchingDrillDown } from "@/types/workshop";

interface GenerateRequest {
    config: BranchingConfigData;
    chartId: string;
}

interface ContinueRequest {
    chartId: string;
    model: string;
    prompt: string;
    sample_idx: number;
    branch_position: number;
    prefix_token_ids: number[];
    forced_next_token_id: number;
    forced_next_token_text: string;
    max_tokens?: number;
}

async function postJson<T>(url: string, body: unknown, headers: Record<string, string>): Promise<T> {
    const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
    });
    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`${url} → ${resp.status} ${text.slice(0, 300)}`);
    }
    const j = (await resp.json()) as { data: T | null };
    if (!j.data) throw new Error(`${url} returned no data`);
    return j.data;
}

export const useBranchingGenerate = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["branchingGenerate"],
        mutationFn: async ({ config: cfg, chartId }: GenerateRequest) => {
            const headers = await createUserHeadersAction();
            const url = config.getApiUrl(config.endpoints.branchingGenerate);
            const data = await postJson<{
                prompt: string;
                model: string;
                samples: BranchingSample[];
            }>(url, cfg, headers);

            // Read prior drill-downs out of the cached row (Chart envelope —
            // its `data` field is BranchingChartData).
            const existingChart = queryClient.getQueryData<{ data: BranchingChartData } | null>(
                queryKeys.charts.chart(chartId),
            );
            const next: BranchingChartData = {
                samples: data.samples,
                drill_downs: existingChart?.data?.drill_downs ?? [],
            };
            await setChartData(chartId, next as unknown as Record<string, unknown>, "branching");
            return { chartId, next };
        },
        onSuccess: ({ chartId }) => {
            // Invalidate the chart row so getChartById refetches with the new
            // data — preserves the full Chart envelope.
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.chart(chartId) });
        },
        onError: (err) => {
            toast.error(err instanceof Error ? err.message : "Branching generation failed");
        },
    });
};

export const useBranchingContinue = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["branchingContinue"],
        mutationFn: async (req: ContinueRequest): Promise<BranchingDrillDown> => {
            const headers = await createUserHeadersAction();
            const url = config.getApiUrl(config.endpoints.branchingContinue);
            const data = await postJson<{
                continuation_text: string;
                continuation_tokens: BranchingDrillDown["continuation_tokens"];
                per_position_top_k: BranchingDrillDown["per_position_top_k"];
            }>(
                url,
                {
                    model: req.model,
                    prompt: req.prompt,
                    prefix_token_ids: req.prefix_token_ids,
                    forced_next_token_id: req.forced_next_token_id,
                    max_tokens: req.max_tokens ?? 60,
                    top_k: 5,
                },
                headers,
            );
            const dd: BranchingDrillDown = {
                sample_idx: req.sample_idx,
                branch_position: req.branch_position,
                forced_token_id: req.forced_next_token_id,
                forced_token_text: req.forced_next_token_text,
                continuation_text: data.continuation_text,
                continuation_tokens: data.continuation_tokens,
                per_position_top_k: data.per_position_top_k,
            };
            const existingChart = queryClient.getQueryData<{ data: BranchingChartData } | null>(
                queryKeys.charts.chart(req.chartId),
            );
            const next: BranchingChartData = {
                samples: existingChart?.data?.samples ?? [],
                drill_downs: [...(existingChart?.data?.drill_downs ?? []), dd],
            };
            await setChartData(
                req.chartId,
                next as unknown as Record<string, unknown>,
                "branching",
            );
            queryClient.invalidateQueries({ queryKey: queryKeys.charts.chart(req.chartId) });
            return dd;
        },
    });
};
