"use client";

import { ChartLine, Grid3x3, Loader2, TriangleAlert } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { TokenArea } from "./TokenArea";
import { useState, useEffect, useRef } from "react";
import { usePrediction } from "@/lib/api/modelsApi";
import type { LensConfigData } from "@/types/lens";

import { TargetTokenSelector } from "./TargetTokenSelector";

import { encodeText } from "@/actions/tok";
import { useUpdateChartConfig } from "@/lib/api/configApi";
import { useParams } from "next/navigation";
import { useLensCharts } from "@/hooks/useLensCharts";
import { cn } from "@/lib/utils";

import { LensConfig } from "@/db/schema";
import GenerateButton from "./GenerateButton";
import { DecoderSelector } from "./DecoderSelector";
import { ChartType } from "@/types/charts";
import { Token } from "@/types/models";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

interface CompletionCardProps {
    initialConfig: LensConfig;
    chartType: ChartType;
    selectedModel: string;
}

export function CompletionCard({ initialConfig, chartType, selectedModel }: CompletionCardProps) {
    const { workspaceId } = useParams<{ workspaceId: string }>();

    const [tokenData, setTokenData] = useState<Token[]>([]);
    const [config, setConfig] = useState<LensConfigData>(initialConfig.data);
    const [editingText, setEditingText] = useState(initialConfig.data.prediction === undefined);
    const [promptHasChangedState, setPromptHasChanged] = useState(false);
    
    // Track if we should auto-run: only if initial config has a prompt pre-filled
    const shouldAutoRunRef = useRef(initialConfig.data.prompt.length > 0 && !initialConfig.data.prediction);
    const hasAutoRunRef = useRef(false);

    const promptHasChanged = promptHasChangedState || config.model !== selectedModel;

    const { mutateAsync: getPrediction, isPending: isExecuting } = usePrediction();
    const { mutateAsync: updateChartConfigMutation } = useUpdateChartConfig();

    const { handleCreateLineChart, handleCreateHeatmap, isCreatingLineChart, isCreatingHeatmap } = useLensCharts({ configId: initialConfig.id });

    // Reset promptHasChanged when config changes (e.g., when switching between different configs)
    useEffect(() => {
        setPromptHasChanged(false);
        // Reset auto-run flags when switching configs
        shouldAutoRunRef.current = initialConfig.data.prompt.length > 0 && !initialConfig.data.prediction;
        hasAutoRunRef.current = false;
    }, [initialConfig.id, initialConfig.data.prompt.length, initialConfig.data.prediction]);

    // Tokenize the prompt if the config changes and there's an existing prediction
    useEffect(() => {
        const fetchTokens = async () => {
            if (config.prediction) {
                const tokens = await encodeText(config.prompt, selectedModel);
                setTokenData(tokens);
            }
        }
        fetchTokens();
    }, [initialConfig.id, config.prediction, config.prompt, selectedModel]);

    // Auto-run tokenization and heatmap generation ONLY on initial mount with pre-filled prompt
    useEffect(() => {
        const autoRunTokenization = async () => {
            // Use pre-filled model from config if available, otherwise use selected model
            const modelToUse = initialConfig.data.model || selectedModel;
            
            // Only auto-run if:
            // 1. shouldAutoRunRef is true (prompt was pre-filled on mount)
            // 2. We haven't auto-run before
            // 3. A model is available (either pre-filled or selected)
            // 4. Not currently executing
            // 5. User hasn't started editing (to avoid interrupting manual typing)
            if (shouldAutoRunRef.current && !hasAutoRunRef.current && modelToUse && !isExecuting && !promptHasChangedState) {
                hasAutoRunRef.current = true;
                shouldAutoRunRef.current = false; // Disable future auto-runs immediately
                console.log("Auto-running tokenization and heatmap generation for pre-filled prompt:", initialConfig.data.prompt);
                console.log("Using model:", modelToUse);
                
                try {
                    await handleTokenize();
                    console.log("Auto-run completed successfully");
                } catch (error) {
                    console.error("Auto-run failed:", error);
                    // Don't reset flags - we only try once, even on error
                    // User can manually run if needed
                }
            }
        };

        // Small delay to ensure all dependencies are ready
        const timer = setTimeout(autoRunTokenization, 800);
        return () => clearTimeout(timer);
    }, [selectedModel, isExecuting, promptHasChangedState, initialConfig.data.prompt, initialConfig.data.model]);

    // Toggle the TokenArea component to the TextArea component
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const tokenContainerRef = useRef<HTMLDivElement>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    const escapeTokenArea = async () => {
        setEditingText(true);

        // Focus the textarea and place cursor at the end after state updates
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                const length = textareaRef.current.value.length;
                textareaRef.current.setSelectionRange(length, length);
            }
        }, 0);
    }

    // Tokenize the prompt and run predictions
    const handleTokenize = async () => {
        const tokens = await encodeText(config.prompt, selectedModel);

        if (tokens.length <= 1) {
            toast.error("Please enter a longer prompt.");
            return;
        }

        setTokenData(tokens);
        // Set the token to the last token in the list
        const temporaryConfig: LensConfigData = {
            ...config,
            model: selectedModel,
            token: { idx: tokens[tokens.length - 1].idx, id: 0, text: "", targetIds: [] }
        }

        if (!promptHasChanged) {
            setEditingText(false);
            return;
        };

        // Run predictions
        await runPredictions(temporaryConfig);
        await handleCreateHeatmap(temporaryConfig);
        setPromptHasChanged(false);
    }

    const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setConfig({
            ...config,
            prompt: e.target.value,
        });
        if (!promptHasChanged) setPromptHasChanged(true);
    };

    // Newline on shift + enter and tokenize on enter
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey && !isExecuting && config.prompt.length > 0) {
            if (promptHasChanged) {
                e.preventDefault();
                handleTokenize();
                console.log("wefaew", promptHasChanged);
            } else {
                console.log("promptHasChanged", promptHasChanged);
                setEditingText(false);
            }
        }
    };

    // Auto-resize the textarea to fit its content
    const autoResizeTextarea = () => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    };
    useEffect(() => {
        if (editingText) autoResizeTextarea();
    }, [config.prompt, editingText]);

    // Close editing when focus leaves to outside of textarea, token area, or settings
    const handleTextareaBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
        if (!config.prediction) return; // only exit editing once a prediction exists

        // Use setTimeout to allow click events to register first
        setTimeout(() => {
            const activeElement = document.activeElement;
            const withinTextarea = activeElement && textareaRef.current?.contains(activeElement);
            const withinToken = activeElement && tokenContainerRef.current?.contains(activeElement);
            const withinSettings = activeElement && settingsRef.current?.contains(activeElement);

            // Check if a popover is open (Radix UI adds data-state="open" to popovers)
            const popoverOpen = document.querySelector('[data-radix-popper-content-wrapper]');

            // if (promptHasChanged) {
            //     handleTokenize();
            // }

            if (withinTextarea || withinToken || withinSettings || popoverOpen) return;

            setEditingText(false);
        }, 0);
    };

    const runPredictions = async (temporaryConfig: LensConfigData) => {
        // Run predictions for the selected token in the config
        const prediction = await getPrediction(temporaryConfig);
        const topThree = prediction.ids.slice(0, 3);

        // Update the config locally
        temporaryConfig.prediction = prediction;
        temporaryConfig.token.targetIds = topThree;
        setConfig(temporaryConfig);

        // Update the config in the database
        await updateChartConfigMutation({
            configId: initialConfig.id,
            config: {
                data: temporaryConfig,
                workspaceId,
                type: "lens",
            }
        });

        // Exit the editing state
        setEditingText(false);
    }

    const handleTokenClick = async (event: React.MouseEvent<HTMLDivElement>, idx: number) => {
        // Prevent the editing state from activating
        event.preventDefault();
        event.stopPropagation();

        // Skip if the token is already selected
        if (config.token.idx === idx) return;

        // Set the token to the last token in the list
        const temporaryConfig: LensConfigData = {
            ...config,
            token: { idx, id: 0, text: "", targetIds: [] }
        }

        // Run predictions
        await runPredictions(temporaryConfig);

        setConfig(temporaryConfig);
        await handleCreateLineChart(temporaryConfig);
    };

    return (
        <div className="flex flex-col w-full gap-3">
            {/* Content */}
            <div className="flex flex-col size-full relative">
                {editingText ? (
                    <Textarea
                        ref={textareaRef}
                        value={config.prompt}
                        onChange={(e) => { handlePromptChange(e); autoResizeTextarea(); }}
                        onKeyDown={handleKeyDown}
                        onBlur={handleTextareaBlur}
                        className="w-full !text-sm bg-input/30 min-h-48 !leading-5"
                        placeholder="Enter your prompt here."
                    />
                ) : (
                    <div
                        ref={tokenContainerRef}
                        className={cn(
                            "flex w-full max-w-[50vw] px-3 py-1 bg-input/30 border rounded min-h-48",
                            isExecuting ? "cursor-progress" : "cursor-text"
                        )}
                        onClick={() => {
                            if (!isExecuting) escapeTokenArea();
                        }}
                    >
                        <TokenArea
                            config={config}
                            handleTokenClick={handleTokenClick}
                            tokenData={tokenData}
                            loading={isExecuting}
                            showFill={chartType === "line"}
                        />
                    </div>
                )}
                {(config.model !== selectedModel && tokenData.length > 0 && !isExecuting)
                    &&
                    <Tooltip>
                        <TooltipTrigger className="absolute bottom-2 right-2">
                            <TriangleAlert className="w-4 h-4 text-destructive/70" />
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                            <p className="w-36 text-wrap text-center">The displayed tokenization does not match the selected model. Please retokenize.</p>
                        </TooltipContent>
                    </Tooltip>
                }
                <div ref={settingsRef} className="absolute bottom-2 right-2 flex items-center gap-3">
                    {editingText && (
                        <GenerateButton
                            configId={initialConfig.id}
                            config={config}
                            setConfig={setConfig}
                            setTokenData={setTokenData}
                            setEditingText={setEditingText}
                            isExecuting={isExecuting}
                            selectedModel={selectedModel}
                            handleTokenize={handleTokenize}
                            handleCreateHeatmap={handleCreateHeatmap}
                        />
                    )}
                </div>

            </div>

            {config.prediction && (
                <div
                    className={cn(
                        "transition-all",
                        (editingText || isExecuting) ? "opacity-60 blur-[0.25px]" : "opacity-100",
                        isExecuting && "!cursor-progress",
                        editingText && "cursor-pointer"
                    )}
                    onMouseDown={() => {
                        if (editingText && !isExecuting) {
                            if (promptHasChanged) {
                                handleTokenize();
                            } else {
                                setEditingText(false);
                            }
                        }
                    }}
                >
                    {/* Prevent pointer events when overlay is active */}
                    <div className={cn(
                        "flex flex-col size-full border p-3 items-center gap-3 bg-card/80 rounded",
                        (editingText || isExecuting) ? "pointer-events-none" : "pointer-events-auto"
                    )}>
                        <div className="flex w-full justify-between items-center">
                            <div className="flex items-center p-1 h-8 bg-background rounded">
                                <button
                                    onClick={() => handleCreateHeatmap(config)}
                                    disabled={isExecuting || isCreatingLineChart || isCreatingHeatmap}
                                    className={cn(
                                        "relative overflow-hidden flex items-center gap-2 px-3 py-0.5 rounded text-xs bg-transparent",
                                        ((chartType === "heatmap" && !isCreatingLineChart) || isCreatingHeatmap) && "bg-popover border"
                                    )}
                                >
                                    {isCreatingHeatmap ? <Loader2 className="w-4 h-4 animate-spin" /> : <Grid3x3 className="w-4 h-4" />}
                                    Heatmap
                                </button>
                                <button
                                    onClick={() => handleCreateLineChart(config)}
                                    disabled={isExecuting || isCreatingLineChart || isCreatingHeatmap || config.token.targetIds.length === 0}
                                    className={cn(
                                        "relative overflow-hidden flex items-center gap-2 px-3 py-0.5 rounded text-xs bg-transparent",
                                        ((chartType === "line" && !isCreatingHeatmap) || isCreatingLineChart) && "bg-popover border"
                                    )}
                                >
                                    {isCreatingLineChart ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChartLine className="w-4 h-4" />}
                                    Line
                                </button>
                            </div>

                            {/* <DecoderSelector /> */}
                        </div>



                        <div className={cn(
                            "size-full",
                            chartType === "heatmap" ? "opacity-50 pointer-events-none" : "pointer-events-auto"
                        )}>
                            <TargetTokenSelector
                                config={config}
                                setConfig={setConfig}
                                configId={initialConfig.id}
                            />
                        </div>


                    </div>
                </div>
            )}
        </div>
    );
}