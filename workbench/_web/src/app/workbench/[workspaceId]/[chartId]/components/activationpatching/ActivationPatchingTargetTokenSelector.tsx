import { useCallback, useEffect, useMemo, useState } from "react";
import AsyncSelect from "react-select/async";
import type { MultiValue, StylesConfig, GroupBase } from "react-select";
import type { ActivationPatchingConfigData } from "@/types/activationPatching";
import { TokenOption } from "@/types/models";
import { useDebouncedCallback } from "use-debounce";
import { Loader2, RotateCcw, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useActivationPatchingCharts } from "@/hooks/useActivationPatchingCharts";
import { useIsMutating } from "@tanstack/react-query";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { usePrediction } from "@/lib/api/modelsApi";

// Helper function to render token text with blue underscore for leading spaces and blue "\n" for newlines
const renderTokenText = (text: string | undefined) => {
    if (!text) return "";
    const elements: React.ReactNode[] = [];
    let index = 0;

    // Represent a single leading space with a blue underscore for visibility
    if (text.startsWith(" ")) {
        elements.push(
            <span className="text-blue-500" key={`lead-space`}>
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
    if (buffer) elements.push(<span key={`tail`}>{buffer}</span>);

    return elements.length ? <>{elements}</> : text;
};

interface ActivationPatchingTargetTokenSelectorProps {
    configId: string;
    config: ActivationPatchingConfigData;
    setConfig: (config: ActivationPatchingConfigData) => void;
}

export const ActivationPatchingTargetTokenSelector = ({
    configId,
    config,
    setConfig,
}: ActivationPatchingTargetTokenSelectorProps) => {
    const { handleCreateLineChart, isExecuting } = useActivationPatchingCharts({ configId });
    const [lineIsPending, setLineIsPending] = useState(false);
    const globalLineRunning = useIsMutating({ mutationKey: ["activationPatchingLine"] }) > 0;
    const { mutateAsync: getPrediction } = usePrediction();
    
    // Initialize prediction from config if it exists, otherwise null
    const [prediction, setPrediction] = useState<any>(config.prediction || null);
    const [isFetchingPredictions, setIsFetchingPredictions] = useState(false);

    // Sync prediction from config when configId changes (chart switch)
    useEffect(() => {
        console.log("Config changed, syncing prediction:", !!config.prediction);
        if (config.prediction) {
            setPrediction(config.prediction);
        }
    }, [configId, config.prediction]);

    // Log config on mount
    console.log("TargetTokenSelector mounted/updated with config:", {
        configId,
        targetIds: config.targetIds,
        hasPrediction: !!config.prediction,
        srcTokens: config.srcTokens?.length,
        tgtTokens: config.tgtTokens?.length,
        srcPosition: config.srcPosition,
        tgtPosition: config.tgtPosition,
    });

    // Fetch predictions from both source and target prompts when config changes
    // ONLY if we don't already have target IDs (to avoid re-fetching on chart switch)
    useEffect(() => {
        const fetchPredictions = async () => {
            // Skip if we already have target IDs (means we're loading existing chart)
            if (config.targetIds && config.targetIds.length > 0) {
                console.log("Target IDs already exist, skipping prediction fetch");
                return;
            }
            
            if (
                config.srcPrompt &&
                config.tgtPrompt &&
                config.srcTokens &&
                config.tgtTokens &&
                config.srcTokens.length > 0 &&
                config.tgtTokens.length > 0 &&
                config.model
            ) {
                try {
                    setIsFetchingPredictions(true);
                    
                    // Use the LAST token index for predictions (what the model predicts next)
                    const srcLastTokenIdx = config.srcTokens[config.srcTokens.length - 1].idx;
                    const tgtLastTokenIdx = config.tgtTokens[config.tgtTokens.length - 1].idx;

                    console.log("Fetching predictions for LAST tokens:", {
                        srcPrompt: config.srcPrompt,
                        srcLastTokenIdx: srcLastTokenIdx,
                        srcLastTokenText: config.srcTokens[config.srcTokens.length - 1].text,
                        tgtPrompt: config.tgtPrompt,
                        tgtLastTokenIdx: tgtLastTokenIdx,
                        tgtLastTokenText: config.tgtTokens[config.tgtTokens.length - 1].text,
                        model: config.model,
                    });

                    // Fetch predictions from source prompt (at last token)
                    const srcPred = await getPrediction({
                        prompt: config.srcPrompt,
                        model: config.model,
                        statisticType: config.metric,
                        token: {
                            idx: srcLastTokenIdx,
                            id: 0,
                            text: "",
                            targetIds: [],
                        },
                    });

                    console.log("Source predictions:", {
                        topId: srcPred.ids[0],
                        topText: srcPred.texts[0],
                        topProb: srcPred.probs[0],
                    });

                    // Fetch predictions from target prompt (at last token)
                    const tgtPred = await getPrediction({
                        prompt: config.tgtPrompt,
                        model: config.model,
                        statisticType: config.metric,
                        token: {
                            idx: tgtLastTokenIdx,
                            id: 0,
                            text: "",
                            targetIds: [],
                        },
                    });

                    console.log("Target predictions:", {
                        topId: tgtPred.ids[0],
                        topText: tgtPred.texts[0],
                        topProb: tgtPred.probs[0],
                    });

                    // Merge predictions from both prompts for the full list
                    // Create a map to track unique tokens by ID with their max probability
                    const tokenMap = new Map<number, { text: string; prob: number }>();

                    // Add source predictions
                    srcPred.ids.forEach((id: number, idx: number) => {
                        const prob = srcPred.probs[idx] ?? 0;
                        tokenMap.set(id, {
                            text: srcPred.texts[idx] ?? "",
                            prob: prob,
                        });
                    });

                    // Add target predictions (update probability if higher)
                    tgtPred.ids.forEach((id: number, idx: number) => {
                        const prob = tgtPred.probs[idx] ?? 0;
                        const existing = tokenMap.get(id);
                        if (!existing || prob > existing.prob) {
                            tokenMap.set(id, {
                                text: tgtPred.texts[idx] ?? "",
                                prob: prob,
                            });
                        }
                    });

                    // Convert map to arrays sorted by probability
                    const sortedEntries = Array.from(tokenMap.entries()).sort(
                        (a, b) => b[1].prob - a[1].prob,
                    );

                    const mergedPrediction = {
                        ids: sortedEntries.map(([id]) => id),
                        texts: sortedEntries.map(([, data]) => data.text),
                        probs: sortedEntries.map(([, data]) => data.prob),
                    };

                    setPrediction(mergedPrediction);

                    // Auto-select top 1 from source and top 1 from target if no target IDs are set
                    if (!config.targetIds || config.targetIds.length === 0) {
                        const topFromSrc = srcPred.ids[0];
                        const topFromTgt = tgtPred.ids[0];
                        
                        // Create array with top tokens, avoiding duplicates
                        const defaultTargets = topFromSrc === topFromTgt 
                            ? [topFromSrc]
                            : [topFromSrc, topFromTgt];
                        
                        console.log("Setting default target IDs:", defaultTargets);
                        
                    setConfig({
                        ...config,
                        targetIds: defaultTargets,
                        prediction: mergedPrediction, // Save prediction for reload
                    });
                } else {
                    // Just update prediction without changing targetIds
                    setConfig({
                        ...config,
                        prediction: mergedPrediction,
                    });
                }
            } catch (error) {
                console.error("Failed to fetch predictions:", error);
            } finally {
                setIsFetchingPredictions(false);
            }
        }
    };
    fetchPredictions();
}, [config.srcPrompt, config.tgtPrompt, config.srcTokens, config.tgtTokens, config.model]);

    // Debounced function to run line chart 3 seconds after target token IDs change
    const debouncedRunLineChart = useDebouncedCallback(async (currentConfig: ActivationPatchingConfigData) => {
        if (currentConfig.targetIds && currentConfig.targetIds.length > 0) {
            await handleCreateLineChart(currentConfig);
        }
        setLineIsPending(false);
    }, 3000);

    const probLookup = useMemo(() => {
        if (!prediction) return null as Map<number, number> | null;
        return new Map<number, number>(
            prediction.ids.map((id: number, idx: number) => [id, prediction.probs[idx] ?? 0]),
        );
    }, [prediction]);

    // Build options from all predicted tokens
    const options: TokenOption[] = useMemo(() => {
        if (!prediction) return [];
        return prediction.ids.map((id: number, index: number) => {
            const text = prediction.texts[index] ?? "";
            const prob = prediction.probs[index] ?? 0;
            return { value: id, text, prob } as TokenOption;
        });
    }, [prediction]);

    // Maintain a local registry of known options so selections from queries persist
    const [knownOptionsById, setKnownOptionsById] = useState<Map<number, TokenOption>>(new Map());

    // Initialize knownOptionsById with target IDs from config when component mounts or config changes
    useEffect(() => {
        const loadTargetTokens = async () => {
            if (!config.targetIds || config.targetIds.length === 0 || !config.model) {
                console.log("No target IDs to load or no model available:", {
                    hasTargetIds: !!config.targetIds,
                    targetIdsLength: config.targetIds?.length,
                    hasModel: !!config.model,
                });
                return;
            }
            
            console.log("Loading target token information for IDs:", config.targetIds);
            
            // Use the tokenizer to decode target IDs
            try {
                const { getTokenizer } = await import("@/actions/tok");
                const tokenizer = await getTokenizer(config.model);
                console.log("Tokenizer loaded successfully for model:", config.model);
                
                // Build a new map with all target IDs decoded
                const newMap = new Map<number, TokenOption>();
                config.targetIds.forEach((id) => {
                    const text = tokenizer.decode([id]);
                    newMap.set(id, {
                        value: id,
                        text: text,
                        prob: 0, // We don't have prob info for manually selected tokens
                    });
                    console.log(`Decoded token ${id}: "${text}"`);
                });
                
                console.log(`Loaded ${newMap.size} tokens into registry, keys:`, Array.from(newMap.keys()));
                setKnownOptionsById(newMap);
            } catch (error) {
                console.error("Failed to load target token information:", error);
            }
        };
        
        loadTargetTokens();
    }, [configId, config.model, JSON.stringify(config.targetIds)]); // Re-run when chart, model, or targetIds change

    // Sync prediction options into known registry
    useEffect(() => {
        if (options.length === 0) return;
        setKnownOptionsById((prev) => {
            const updated = new Map(prev);
            for (const opt of options) {
                updated.set(opt.value, opt);
            }
            return updated;
        });
    }, [options]);

    const selectedOptions: TokenOption[] = useMemo(() => {
        console.log("Computing selectedOptions:", {
            targetIds: config.targetIds,
            knownOptionsByIdSize: knownOptionsById.size,
            knownOptionsKeys: Array.from(knownOptionsById.keys()),
        });
        
        if (!config.targetIds || config.targetIds.length === 0) {
            console.log("No targetIds, returning empty array");
            return [];
        }
        
        const selected = config.targetIds
            .map((id) => {
                const option = knownOptionsById.get(id);
                console.log(`Mapping targetId ${id}:`, option ? `found "${option.text}"` : "NOT FOUND");
                return option;
            })
            .filter((v): v is TokenOption => !!v);
            
        console.log("Selected options:", selected);
        return selected;
    }, [knownOptionsById, config.targetIds]);

    const handleChange = (newValue: MultiValue<TokenOption>) => {
        const newIds = newValue.map((opt) => opt.value);
        // Persist any newly chosen options into the registry
        setKnownOptionsById((prev) => {
            const updated = new Map(prev);
            for (const opt of newValue) {
                updated.set(opt.value, opt);
            }
            return updated;
        });
        const newConfig = {
            ...config,
            targetIds: newIds,
        };
        setConfig(newConfig);
        
        // Note: Auto-run is handled by the parent component's useEffect
        // No need to call handleCreateLineChart here
    };

    const debouncedFetch = useDebouncedCallback(
        async (
            query: string,
            model: string,
            pLookup: Map<number, number> | null,
            resolve: (options: TokenOption[]) => void,
        ) => {
            const raw = query ?? "";
            console.log("Searching for token:", raw);
            if (raw.length === 0) {
                resolve([]);
                return;
            }
            try {
                const resp = await fetch("/api/tokens/query", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ query: raw, model, limit: 50 }),
                });
                const data = (await resp.json()) as { tokens?: TokenOption[] };
                const tokens = data.tokens ?? [];

                console.log(`Found ${tokens.length} tokens matching "${raw}"`);

                // Attach probs and sort by probability descending
                const opts = tokens.map(
                    (t) =>
                        ({
                            value: t.value,
                            text: t.text,
                            prob: pLookup?.get(t.value) ?? 0,
                        }) as TokenOption,
                );

                opts.sort((a, b) => (b.prob ?? 0) - (a.prob ?? 0));
                resolve(opts);
            } catch (error) {
                console.error("Token search error:", error);
                resolve([]);
            }
        },
        500,
    );

    const loadOptions = useCallback(
        (inputValue: string): Promise<TokenOption[]> =>
            new Promise((resolve) => {
                debouncedFetch.cancel();
                // If input is empty or whitespace-only, show predictions; otherwise query
                const raw = inputValue ?? "";
                if (raw.length === 0 || /^\s*$/.test(raw)) {
                    resolve(options);
                } else {
                    debouncedFetch(inputValue, config.model, probLookup, (fetched) => {
                        // Merge fetched options into known registry for persistence
                        setKnownOptionsById((prev) => {
                            const updated = new Map(prev);
                            for (const opt of fetched) updated.set(opt.value, opt);
                            return updated;
                        });
                        resolve(fetched);
                    });
                }
            }),
        [debouncedFetch, config.model, probLookup, options],
    );

    const [inputValue, setInputValue] = useState<string>("");

    // Don't require prediction to render - we can show selected tokens from knownOptionsById
    // Predictions are only needed for the dropdown options
    console.log("TargetTokenSelector rendering with prediction:", !!prediction, "knownOptions:", knownOptionsById.size);

    return (
        <div className="flex flex-col gap-1.5 w-full">
            <div className="flex justify-between items-center">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="text-xs">Target Tokens</span>
                    </TooltipTrigger>
                    <TooltipContent side="right">Defaults to top 1 from each prompt.</TooltipContent>
                </Tooltip>

                <div className="flex items-center gap-3">
                    {config.targetIds && config.targetIds.length > 0 && (
                        <button
                            className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                                setConfig({
                                    ...config,
                                    targetIds: [],
                                });
                            }}
                        >
                            <X className="w-3 h-3" />
                            Clear
                        </button>
                    )}
                    {config.targetIds && config.targetIds.length > 0 && (
                        <Separator orientation="vertical" className="h-3 w-[0.5px]" />
                    )}
                    <button
                        className={cn(
                            "text-xs flex items-center gap-1 text-muted-foreground",
                            isExecuting || lineIsPending || globalLineRunning
                                ? "cursor-progress"
                                : "cursor-pointer hover:text-foreground",
                        )}
                        disabled={isExecuting || lineIsPending || globalLineRunning}
                        onClick={async () => {
                            setLineIsPending(true);
                            await debouncedRunLineChart(config);
                        }}
                    >
                        {isExecuting || lineIsPending || globalLineRunning ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                            <RotateCcw className="w-3 h-3" />
                        )}
                        Rerun
                    </button>
                </div>
            </div>
            <div className="w-full flex-1 min-w-[12rem]">
                {isFetchingPredictions ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-4 px-3 border rounded bg-background">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Loading predictions...</span>
                    </div>
                ) : (
                    <AsyncSelect<TokenOption, true>
                        classNamePrefix="pred-select"
                        isMulti
                        isClearable
                        defaultOptions={options}
                        cacheOptions
                        loadOptions={loadOptions}
                        value={selectedOptions}
                        onChange={handleChange}
                        styles={selectStyles}
                        placeholder="Enter a token..."
                        closeMenuOnSelect={false}
                        inputValue={inputValue}
                        onInputChange={(newValue) => {
                            setInputValue(newValue);
                        }}
                        formatOptionLabel={(option: TokenOption) => (
                            <div className="flex items-center justify-between w-full">
                                <span className="font-medium text-foreground">
                                    {renderTokenText(option.text)}
                                </span>
                                <span className="ml-3 text-xs text-muted-foreground">
                                    {(option.prob ?? 0).toFixed(4)}
                                </span>
                            </div>
                        )}
                        components={{
                            IndicatorSeparator: () => null,
                            DropdownIndicator: () => null,
                            ClearIndicator: () => null,
                            IndicatorsContainer: () => null,
                            MultiValue: CustomMultiValue,
                        }}
                        onKeyDown={(e) => {
                            // Allow leading space by manually inserting into controlled input, while preventing option selection
                            if (e.key === " " && inputValue.length === 0) {
                                e.preventDefault();
                                setInputValue(" ");
                            }
                        }}
                    />
                )}
            </div>
        </div>
    );
};

// Custom MultiValue component with click handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomMultiValue = (props: any) => {
    const [isHighlighted, setIsHighlighted] = useState(false);

    return (
        <div
            className={cn(
                "inline-flex items-center gap-1 px-3 hover:bg-accent rounded text-xs font-medium cursor-pointer transition-colors",
                isHighlighted
                    ? "bg-popover border border-primary"
                    : "bg-popover border border-input",
            )}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsHighlighted(!isHighlighted);
            }}
            onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
        >
            <span className="text-muted-foreground">{renderTokenText(props.data.text)}</span>
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
                className="ml-1 text-muted-foreground hover:text-foreground"
            >
                <X className="w-3 h-3" />
            </button>
        </div>
    );
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
        minHeight: "2rem", // match h-8 icon buttons while allowing wrap growth
        fontSize: "0.875rem", // text-sm
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
        paddingLeft: 4,
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
        "&::-webkit-scrollbar": {
            display: "none",
        },
        scrollbarWidth: "none",
        msOverflowStyle: "none",
    }),
    option: (base, state) => ({
        ...base,
        backgroundColor: state.isFocused ? "hsl(var(--accent))" : "transparent",
        color: state.isFocused ? "hsl(var(--accent-foreground))" : "hsl(var(--popover-foreground))",
        ":active": {
            backgroundColor: "hsl(var(--accent))",
        },
    }),
};

