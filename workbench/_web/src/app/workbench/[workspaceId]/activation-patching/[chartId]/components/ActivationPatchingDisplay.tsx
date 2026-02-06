"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useQuery, useIsMutating } from "@tanstack/react-query";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { ActivationPatchingData, ActivationPatchingConfigData } from "@/types/activationPatching";
import { Loader2, X, RotateCcw } from "lucide-react";
import { LinePlotWidget } from "./LinePlotWidget";
import { cn } from "@/lib/utils";
import { useUpdateChartConfig } from "@/lib/api/configApi";
import Select, { MultiValue, StylesConfig, GroupBase, components } from "react-select";

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

// Option type for react-select
interface TokenOption {
    value: number;
    label: string;
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

// Helper function to render token text with visual indicators for leading spaces and newlines
const renderTokenText = (text: string | undefined): React.ReactNode => {
    if (!text) return "";
    const elements: React.ReactNode[] = [];
    let index = 0;

    // Represent a single leading space with a blue underscore for visibility
    if (text.startsWith(" ")) {
        elements.push(
            <span className="text-blue-500" key="lead-space">
                _
            </span>,
        );
        index = 1;
    }

    let buffer = "";
    for (; index < text.length; index++) {
        const ch = text[index];
        if (ch === "\n") {
            if (buffer) {
                elements.push(<span key={`txt-${index}`}>{buffer}</span>);
                buffer = "";
            }
            elements.push(
                <span className="text-blue-500" key={`nl-${index}`}>
                    \n
                </span>,
            );
        } else {
            buffer += ch;
        }
    }
    if (buffer) elements.push(<span key="tail">{buffer}</span>);

    return elements.length ? <>{elements}</> : text;
};

// Theme-aware styles for react-select using shadcn/tailwind CSS variables
const selectStyles: StylesConfig<TokenOption, true, GroupBase<TokenOption>> = {
    container: (base) => ({
        ...base,
        width: "100%",
    }),
    control: (base, state) => ({
        ...base,
        backgroundColor: "hsl(var(--background))",
        borderColor: state.isFocused ? "hsl(var(--ring))" : "hsl(var(--input))",
        boxShadow: state.isFocused ? "0 0 0 1px hsl(var(--ring))" : "none",
        boxSizing: "border-box",
        minHeight: "2.25rem",
        fontSize: "0.875rem",
        lineHeight: "1rem",
        alignItems: "center",
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        paddingRight: 0,
        ":hover": {
            borderColor: "hsl(var(--input))",
        },
    }),
    valueContainer: (base) => ({
        ...base,
        position: "relative",
        paddingTop: 4,
        paddingBottom: 4,
        paddingLeft: 8,
        gap: 4,
        alignItems: "center",
        minHeight: "2rem",
        flexWrap: "wrap",
    }),
    input: (base) => ({
        ...base,
        color: "hsl(var(--foreground))",
        margin: 0,
        padding: 0,
        order: 1,
        minWidth: 2,
        paddingLeft: 2,
    }),
    placeholder: (base) => ({
        ...base,
        color: "hsl(var(--muted-foreground))",
        fontSize: "0.875rem",
    }),
    menu: (base) => ({
        ...base,
        backgroundColor: "hsl(var(--popover))",
        border: "1px solid hsl(var(--border))",
        overflow: "hidden",
        zIndex: 50,
        fontSize: "0.75rem",
    }),
    menuList: (base) => ({
        ...base,
        maxHeight: "200px",
        "&::-webkit-scrollbar": {
            width: "6px",
        },
        "&::-webkit-scrollbar-thumb": {
            backgroundColor: "hsl(var(--muted-foreground) / 0.3)",
            borderRadius: "3px",
        },
    }),
    option: (base, state) => ({
        ...base,
        backgroundColor: state.isFocused ? "hsl(var(--accent))" : "transparent",
        color: state.isSelected 
            ? "hsl(var(--muted-foreground))" 
            : state.isFocused 
                ? "hsl(var(--accent-foreground))" 
                : "hsl(var(--popover-foreground))",
        fontSize: "0.875rem",
        padding: "8px 12px",
        cursor: "pointer",
        ":active": {
            backgroundColor: "hsl(var(--accent))",
        },
    }),
    noOptionsMessage: (base) => ({
        ...base,
        color: "hsl(var(--muted-foreground))",
        fontSize: "0.875rem",
    }),
};

// Custom MultiValue component with colored indicator
const CustomMultiValue = (props: any) => {
    const color = LINE_COLORS[props.data.value % LINE_COLORS.length];
    
    return (
        <div
            className={cn(
                "inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded text-sm cursor-default transition-colors",
                "bg-secondary border border-input hover:bg-violet-500/10 hover:border-violet-500/30 group"
            )}
        >
            {/* <span 
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
            /> */}
            <span className="text-muted-foreground group-hover:text-violet-600">
                {renderTokenText(props.data.label)}
            </span>
            <button
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    props.removeProps.onClick(e);
                }}
                onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                className="ml-0.5 text-muted-foreground/50 hover:text-violet-500 transition-colors"
            >
                <X className="w-3 h-3" />
            </button>
        </div>
    );
};

// Custom Option component with badges for source/target predictions
const CustomOption = (props: any) => {
    const tokenIndex = props.data.value;
    const badge = tokenIndex === 0 ? "source pred" : tokenIndex === 1 ? "target pred" : null;
    
    return (
        <components.Option {...props}>
            <div className="flex items-center justify-between w-full gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate">{renderTokenText(props.data.label)}</span>
                    {badge && (
                        <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-violet-500/15 text-violet-500 border border-violet-500/20">
                            {badge}
                        </span>
                    )}
                </div>
                {props.isSelected && (
                    <span className="flex-shrink-0 text-xs text-muted-foreground">selected</span>
                )}
            </div>
        </components.Option>
    );
};

// Token selector component using react-select
interface TokenSelectorProps {
    allLabels: string[];
    selectedIndices: Set<number>;
    onChange: (indices: number[]) => void;
    defaultIndices: Set<number>;
}

function TokenSelector({ allLabels, selectedIndices, onChange, defaultIndices }: TokenSelectorProps) {
    // Build options from all labels
    const options: TokenOption[] = useMemo(() => {
        return allLabels.map((label, index) => ({
            value: index,
            label: label,
        }));
    }, [allLabels]);

    // Get selected options
    const selectedOptions: TokenOption[] = useMemo(() => {
        return Array.from(selectedIndices)
            .sort((a, b) => a - b)
            .map(index => ({
                value: index,
                label: allLabels[index] || `Token ${index}`,
            }));
    }, [selectedIndices, allLabels]);

    // Handle change
    const handleChange = (newValue: MultiValue<TokenOption>) => {
        const newIndices = newValue.map(opt => opt.value);
        onChange(newIndices);
    };

    // Reset to default (first two tokens - source and target predictions)
    const handleReset = () => {
        onChange(Array.from(defaultIndices));
    };

    // Check if current selection differs from default
    const isDefaultSelection = useMemo(() => {
        if (selectedIndices.size !== defaultIndices.size) return false;
        for (const idx of selectedIndices) {
            if (!defaultIndices.has(idx)) return false;
        }
        return true;
    }, [selectedIndices, defaultIndices]);

    return (
        <div className="flex flex-col gap-1.5 w-full">
            <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Tokens</span>
                <div className="flex items-center gap-2">
                    {!isDefaultSelection && (
                        <button
                            className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                            onClick={handleReset}
                        >
                            <RotateCcw className="w-3 h-3" />
                            Reset
                        </button>
                    )}
                </div>
            </div>
            <div className="w-full">
                <Select<TokenOption, true>
                    isMulti
                    options={options}
                    value={selectedOptions}
                    onChange={handleChange}
                    styles={selectStyles}
                    placeholder="Search tokens..."
                    closeMenuOnSelect={false}
                    hideSelectedOptions={false}
                    isClearable={false}
                    components={{
                        IndicatorSeparator: () => null,
                        DropdownIndicator: () => null,
                        ClearIndicator: () => null,
                        MultiValue: CustomMultiValue,
                        Option: CustomOption,
                    }}
                    noOptionsMessage={() => "No tokens found"}
                    filterOption={(option, inputValue) => {
                        return option.label.toLowerCase().includes(inputValue.toLowerCase());
                    }}
                />
            </div>
        </div>
    );
}

type DisplayMode = "probability" | "rank";

export function ActivationPatchingDisplay() {
    const { chartId, workspaceId } = useParams<{ chartId: string; workspaceId: string }>();
    const [selectedLineIndices, setSelectedLineIndices] = useState<Set<number>>(new Set([0, 1]));
    const [displayMode, setDisplayMode] = useState<DisplayMode>("probability");
    const hasInitializedFromConfig = useRef(false);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const previousDataRef = useRef<string | null>(null);

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

    // Create a fingerprint of the data to detect when new results arrive
    const dataFingerprint = useMemo(() => {
        if (!hasData || !patchingChart?.data?.tokenLabels) return null;
        // Use the first few token labels as a fingerprint
        return patchingChart.data.tokenLabels.slice(0, 3).join(",");
    }, [hasData, patchingChart?.data?.tokenLabels]);

    // Get default selection (first two tokens - source and target predictions)
    const getDefaultSelection = useCallback((numLines: number) => {
        const defaults = new Set<number>();
        if (numLines > 0) defaults.add(0);
        if (numLines > 1) defaults.add(1);
        return defaults;
    }, []);

    // Reset to defaults when new data arrives (after a re-run)
    useEffect(() => {
        if (!hasData || !patchingChart?.data?.lines) return;
        
        const currentFingerprint = dataFingerprint;
        if (currentFingerprint && previousDataRef.current !== null && previousDataRef.current !== currentFingerprint) {
            // Data changed - reset to default selection (first two tokens)
            const defaultIndices = getDefaultSelection(patchingChart.data.lines.length);
            setSelectedLineIndices(defaultIndices);
            
            // Also save the default selection to config
            if (patchingConfig?.id) {
                updateConfig({
                    configId: patchingConfig.id,
                    chartId,
                    config: {
                        data: {
                            ...patchingConfig.data,
                            selectedLineIndices: Array.from(defaultIndices),
                        },
                        workspaceId,
                        type: "activation-patching",
                    },
                });
            }
        }
        previousDataRef.current = currentFingerprint;
    }, [dataFingerprint, hasData, patchingChart?.data?.lines, getDefaultSelection, patchingConfig, chartId, workspaceId, updateConfig]);

    // Initialize selection from config when it loads (first load only)
    useEffect(() => {
        if (patchingConfig?.data?.selectedLineIndices && !hasInitializedFromConfig.current) {
            setSelectedLineIndices(new Set(patchingConfig.data.selectedLineIndices));
            hasInitializedFromConfig.current = true;
        } else if (hasData && patchingChart?.data?.lines && !hasInitializedFromConfig.current) {
            // Default to first two lines if no saved selection
            const defaultIndices = getDefaultSelection(patchingChart.data.lines.length);
            setSelectedLineIndices(defaultIndices);
            hasInitializedFromConfig.current = true;
        }
    }, [patchingConfig?.data?.selectedLineIndices, hasData, patchingChart?.data?.lines, getDefaultSelection]);

    // Reset initialization flag when chart changes
    useEffect(() => {
        hasInitializedFromConfig.current = false;
        previousDataRef.current = null;
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
        }, 500);
    }, [patchingConfig, chartId, workspaceId, updateConfig]);

    // All available labels
    const allLabels = useMemo(() => {
        if (!hasData || !patchingChart?.data?.tokenLabels) return [];
        return patchingChart.data.tokenLabels;
    }, [hasData, patchingChart?.data?.tokenLabels]);

    // Default selection (first two tokens - source and target predictions)
    const defaultSelection = useMemo(() => {
        const numLines = patchingChart?.data?.lines?.length || 0;
        return getDefaultSelection(numLines);
    }, [patchingChart?.data?.lines?.length, getDefaultSelection]);

    // Handle selection change
    const handleSelectionChange = useCallback((indices: number[]) => {
        const newSet = new Set(indices);
        setSelectedLineIndices(newSet);
        saveSelection(newSet);
    }, [saveSelection]);

    // Prepare filtered data for the line plot
    const plotData = useMemo(() => {
        if (!hasData || !patchingChart?.data) return null;
        
        const selectedIndicesArray = Array.from(selectedLineIndices).sort((a, b) => a - b);
        
        // Select either probabilities (lines) or ranks based on display mode
        const sourceData = displayMode === "probability" 
            ? patchingChart.data!.lines 
            : patchingChart.data!.ranks;
        
        if (!sourceData) return null;
        
        const lines = selectedIndicesArray
            .filter(i => i < sourceData.length)
            .map(i => sourceData[i]);
        const labels = selectedIndicesArray
            .filter(i => i < (patchingChart.data!.tokenLabels?.length || 0))
            .map(i => patchingChart.data!.tokenLabels![i]);
        
        return { lines, labels };
    }, [hasData, patchingChart?.data, selectedLineIndices, displayMode]);

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
            {/* Token selector and mode toggle header */}
            <div className="p-3 flex flex-col gap-3">
                {/* Mode toggle */}
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Display:</span>
                    <div className="inline-flex items-center rounded-md border border-input bg-background p-0.5">
                        <button
                            onClick={() => setDisplayMode("probability")}
                            className={cn(
                                "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                                displayMode === "probability"
                                    ? "bg-violet-500 text-white"
                                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                            )}
                        >
                            Probability
                        </button>
                        <button
                            onClick={() => setDisplayMode("rank")}
                            className={cn(
                                "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                                displayMode === "rank"
                                    ? "bg-violet-500 text-white"
                                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                            )}
                        >
                            Rank
                        </button>
                    </div>
                </div>

                {/* Token selector */}
                <TokenSelector
                    allLabels={allLabels}
                    selectedIndices={selectedLineIndices}
                    onChange={handleSelectionChange}
                    defaultIndices={defaultSelection}
                />
            </div>

            {/* Chart area */}
            <div className="flex-1 p-4 min-h-0">
                {plotData && plotData.lines.length > 0 ? (
                    <LinePlotWidget
                        data={plotData}
                        title={displayMode === "probability" 
                            ? "Activation Patching: Token Probability by Layer"
                            : "Activation Patching: Token Rank by Layer"
                        }
                        yAxisLabel={displayMode === "probability" ? "Probability" : "Rank"}
                        xAxisLabel="Layer"
                        transparentBackground
                        mode={displayMode}
                        invertYAxis={displayMode === "rank"}
                        minValue={displayMode === "probability" ? 0 : undefined}
                        maxValue={displayMode === "probability" ? 1 : undefined}
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
