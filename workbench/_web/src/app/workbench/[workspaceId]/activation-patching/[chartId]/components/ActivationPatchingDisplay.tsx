"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useQuery, useIsMutating } from "@tanstack/react-query";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { ActivationPatchingData, ActivationPatchingConfigData } from "@/types/activationPatching";
import { Loader2, Search, X, Check } from "lucide-react";
import { LinePlotWidget } from "./LinePlotWidget";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useUpdateChartConfig } from "@/lib/api/configApi";

interface ActivationPatchingChart {
    id: string;
    data: ActivationPatchingData | null;
    type: string;
    workspaceId?: string;
}

interface ActivationPatchingConfig {
    id: string;
    data: ActivationPatchingConfigData;
    type: string;
    workspaceId: string;
}

// Color palette matching LinePlotWidget
const LINE_COLORS = [
    "#3b82f6",  // blue
    "#ef4444",  // red
    "#22c55e",  // green
    "#f59e0b",  // amber
    "#8b5cf6",  // violet
    "#ec4899",  // pink
    "#06b6d4",  // cyan
    "#84cc16",  // lime
];

export function ActivationPatchingDisplay() {
    const { chartId, workspaceId } = useParams<{ chartId: string; workspaceId: string }>();
    const [selectedLineIndices, setSelectedLineIndices] = useState<Set<number>>(new Set([0, 1]));
    const [searchQuery, setSearchQuery] = useState("");
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const hasInitializedFromConfig = useRef(false);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const isPatchingRunning = useIsMutating({ mutationKey: ["activationPatching"] }) > 0;

    const { data: chart, isLoading: isChartLoading } = useQuery({
        queryKey: queryKeys.charts.chart(chartId),
        queryFn: () => getChartById(chartId as string),
        enabled: !!chartId,
    });

    const { data: config, isLoading: isConfigLoading } = useQuery({
        queryKey: queryKeys.charts.configByChart(chartId),
        queryFn: () => getConfigForChart(chartId),
        enabled: !!chartId,
    });

    const { mutate: updateConfig } = useUpdateChartConfig();

    const patchingChart = chart as ActivationPatchingChart | undefined;
    const patchingConfig = config as ActivationPatchingConfig | undefined;
    const hasData = patchingChart?.data && "lines" in patchingChart.data && patchingChart.data.lines.length > 0;

    // Initialize selection from config when it loads
    useEffect(() => {
        if (patchingConfig?.data?.selectedLineIndices && !hasInitializedFromConfig.current) {
            setSelectedLineIndices(new Set(patchingConfig.data.selectedLineIndices));
            hasInitializedFromConfig.current = true;
        } else if (hasData && patchingChart?.data?.lines && !hasInitializedFromConfig.current) {
            // Default to first two lines if no saved selection
            const defaultIndices = new Set<number>();
            if (patchingChart.data.lines.length > 0) defaultIndices.add(0);
            if (patchingChart.data.lines.length > 1) defaultIndices.add(1);
            setSelectedLineIndices(defaultIndices);
            hasInitializedFromConfig.current = true;
        }
    }, [patchingConfig?.data?.selectedLineIndices, hasData, patchingChart?.data?.lines]);

    // Reset initialization flag when chart changes
    useEffect(() => {
        hasInitializedFromConfig.current = false;
    }, [chartId]);

    // Save selection to config (debounced)
    const saveSelection = useCallback((indices: Set<number>) => {
        if (!patchingConfig?.id) return;
        
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(() => {
            updateConfig({
                configId: patchingConfig.id,
                chartId,
                config: {
                    data: {
                        ...patchingConfig.data,
                        selectedLineIndices: Array.from(indices),
                    },
                    workspaceId,
                    type: "activation-patching",
                },
            });
        }, 500); // Debounce by 500ms
    }, [patchingConfig, chartId, workspaceId, updateConfig]);

    // All available labels
    const allLabels = useMemo(() => {
        if (!hasData || !patchingChart?.data?.tokenLabels) return [];
        return patchingChart.data.tokenLabels;
    }, [hasData, patchingChart?.data?.tokenLabels]);

    // Filtered labels based on search
    const filteredOptions = useMemo(() => {
        if (!allLabels.length) return [];
        return allLabels
            .map((label, index) => ({ label, index }))
            .filter(({ label }) => 
                label.toLowerCase().includes(searchQuery.toLowerCase())
            );
    }, [allLabels, searchQuery]);

    // Toggle line selection
    const toggleLine = (index: number) => {
        setSelectedLineIndices(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            // Save to config
            saveSelection(next);
            return next;
        });
    };

    // Prepare filtered data for the line plot
    const plotData = useMemo(() => {
        if (!hasData || !patchingChart?.data) return null;
        
        const selectedIndicesArray = Array.from(selectedLineIndices).sort((a, b) => a - b);
        const lines = selectedIndicesArray
            .filter(i => i < patchingChart.data!.lines.length)
            .map(i => patchingChart.data!.lines[i]);
        const labels = selectedIndicesArray
            .filter(i => i < (patchingChart.data!.tokenLabels?.length || 0))
            .map(i => patchingChart.data!.tokenLabels![i]);
        
        return { lines, labels };
    }, [hasData, patchingChart?.data, selectedLineIndices]);

    // Loading state
    if (isChartLoading || isConfigLoading) {
        return (
            <div className="flex size-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // Computing state
    if (isPatchingRunning) {
        return (
            <div className="flex size-full items-center justify-center flex-col gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Computing activation patching...</p>
            </div>
        );
    }

    // Empty state
    if (!hasData) {
        return (
            <div className="flex size-full items-center justify-center border mx-3 mt-3 border-dashed rounded pb-6">
                <div className="text-muted-foreground text-center max-w-md">
                    <p className="text-lg font-medium mb-2">No visualization data</p>
                    <p className="text-sm">
                        Enter source and target prompts, select token positions in each,
                        then click &quot;Run Activation Patching&quot; to visualize how activations
                        transfer between prompts across model layers.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="size-full overflow-auto flex flex-col">
            {/* Token selector header */}
            <div className="p-3 border-b flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Token Lines</span>
                    <span className="text-xs text-muted-foreground">
                        {selectedLineIndices.size} of {allLabels.length} selected
                    </span>
                </div>
                
                {/* Search input */}
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search tokens to add..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => setIsDropdownOpen(true)}
                        className="pl-9 h-9"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                    
                    {/* Dropdown */}
                    {isDropdownOpen && filteredOptions.length > 0 && (
                        <div 
                            className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-auto bg-popover border rounded-md shadow-lg"
                            onMouseLeave={() => !searchQuery && setIsDropdownOpen(false)}
                        >
                            {filteredOptions.map(({ label, index }) => {
                                const isSelected = selectedLineIndices.has(index);
                                const color = LINE_COLORS[index % LINE_COLORS.length];
                                return (
                                    <button
                                        key={index}
                                        onClick={() => toggleLine(index)}
                                        className={cn(
                                            "w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-muted/50 transition-colors",
                                            isSelected && "bg-muted/30"
                                        )}
                                    >
                                        <span 
                                            className="w-3 h-3 rounded-sm flex-shrink-0"
                                            style={{ backgroundColor: color }}
                                        />
                                        <span className="flex-1 truncate font-mono">{label}</span>
                                        {isSelected && <Check className="h-4 w-4 text-violet-500" />}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Selected tokens as badges */}
                {selectedLineIndices.size > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {Array.from(selectedLineIndices).sort((a, b) => a - b).map((index) => {
                            const label = allLabels[index] || `Token ${index}`;
                            const color = LINE_COLORS[index % LINE_COLORS.length];
                            return (
                                <Badge
                                    key={index}
                                    variant="secondary"
                                    className="gap-1.5 pr-1 font-mono text-xs cursor-pointer hover:bg-muted"
                                    onClick={() => toggleLine(index)}
                                >
                                    <span 
                                        className="w-2 h-2 rounded-sm"
                                        style={{ backgroundColor: color }}
                                    />
                                    {label}
                                    <X className="h-3 w-3 ml-0.5" />
                                </Badge>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Chart area */}
            <div className="flex-1 p-4 min-h-0">
                {plotData && plotData.lines.length > 0 ? (
                    <LinePlotWidget
                        data={plotData}
                        title="Activation Patching: Token Probability by Layer"
                        yAxisLabel="Probability"
                        xAxisLabel="Layer"
                    />
                ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                        Select at least one token to display
                    </div>
                )}
            </div>
        </div>
    );
}
