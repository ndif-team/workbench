"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getModels } from "@/lib/api/modelsApi";
import { useWorkspace } from "@/stores/useWorkspace";
import { useLensRuns, useClearLensRuns } from "@/lib/api/lensRunApi";
import { Button } from "@/components/ui/button";
import { LensHistoryStrip } from "./LensHistoryStrip";

/**
 * F1 container: the prompt-history rail for cm-intro. Reads the chart + active
 * model, fetches that chart's run history (scoped to the model, since strips
 * only align layer-for-layer within one model), and stacks the final-token
 * strips oldest → newest with the most recent highlighted. Clicking a strip
 * loads its prompt back into the composer to iterate or expand.
 */

interface LensHistoryRailProps {
    onSelectPrompt: (prompt: string) => void;
}

export function LensHistoryRail({ onSelectPrompt }: LensHistoryRailProps) {
    const { chartId } = useParams<{ chartId: string }>();
    const { selectedModelIdx } = useWorkspace();

    const { data: models } = useQuery({
        queryKey: ["models"],
        queryFn: getModels,
        refetchInterval: 120000,
    });

    const selectedModel = useMemo(() => {
        if (!models || models.length === 0) return undefined;
        return models[selectedModelIdx]?.name || models[0].name;
    }, [models, selectedModelIdx]);

    const { data: runs } = useLensRuns(chartId, selectedModel);
    const { mutate: clearHistory, isPending: isClearing } = useClearLensRuns(chartId);

    // Newest last from the query; render newest first with it highlighted.
    const ordered = useMemo(() => (runs ? [...runs].reverse() : []), [runs]);
    const activeId = ordered[0]?.id;

    return (
        <div className="flex h-full flex-col">
            <div className="p-3 border-b flex items-center justify-between">
                <h2 className="text-sm pl-2 font-medium">Prompt history</h2>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground"
                        disabled={!ordered.length || isClearing}
                        onClick={() => clearHistory()}
                    >
                        Clear
                    </Button>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5" data-testid="lens-history-list">
                {ordered.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-2 py-6 text-center leading-snug">
                        Run a prompt to start a history. Each run is stacked here so you can compare how
                        successive versions change the final-token prediction.
                    </p>
                ) : (
                    ordered.map((run) => (
                        <LensHistoryStrip
                            key={run.id}
                            run={run}
                            isActive={run.id === activeId}
                            onSelect={onSelectPrompt}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
