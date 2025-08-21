"use client";

import { ChartLine, Grid3x3 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { TokenArea } from "./TokenArea";
import { useState, useEffect, useRef } from "react";
import { usePrediction } from "@/lib/api/modelsApi";
import type { LensConfigData } from "@/types/lens";

import { PredictionBadges } from "./PredictionBadges";

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
    const [promptHasChanged, setPromptHasChanged] = useState(false);

    const { mutateAsync: getPrediction, isPending: isExecuting } = usePrediction();
    const { mutateAsync: updateChartConfigMutation } = useUpdateChartConfig();

    const { handleCreateLineChart, handleCreateHeatmap } = useLensCharts({ configId: initialConfig.id });

    // Reset promptHasChanged when config changes (e.g., when switching between different configs)
    useEffect(() => {
        setPromptHasChanged(false);
    }, [initialConfig.id]);

    // Tokenize the prompt if the config changes and there's an existing prediction
    useEffect(() => {
        const fetchTokens = async () => {
            if (config.prediction) {
                const tokens = await encodeText(config.prompt, selectedModel);
                setTokenData(tokens);
            }
        }
        fetchTokens();
    }, [initialConfig.id]);

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
        if (e.key === "Enter" && !e.shiftKey && !isExecuting) {
            e.preventDefault();
            handleTokenize();
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
                        className="w-full !text-sm bg-card min-h-48 !leading-5"
                        placeholder="Enter your prompt here."
                    />
                ) : (
                    <div
                        ref={tokenContainerRef}
                        className={cn(
                            "flex w-full px-3 py-3 bg-card border rounded min-h-48",
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
                        isExecuting ? "!cursor-progress" : "cursor-pointer"
                    )}
                    onMouseDown={() => {
                        if (editingText && !isExecuting) setEditingText(false);
                    }}
                >
                    {/* Prevent pointer events when overlay is active */}
                    <div className={cn(
                        "flex flex-col size-full border p-3 items-center gap-3 bg-card rounded",
                        (editingText || isExecuting) ? "pointer-events-none" : "pointer-events-auto"
                    )}>
                        <div className="flex w-full justify-between items-center">
                            <div className="flex items-center p-1 h-8 bg-background rounded">
                                <button
                                    onClick={() => handleCreateHeatmap(config)}
                                    className={cn(
                                        "flex items-center gap-3 px-3 py-0.5 rounded text-xs bg-transparent",
                                        chartType === "heatmap" && "bg-popover border"
                                    )}
                                >
                                    <Grid3x3 className="w-4 h-4" />
                                    Heatmap
                                </button>
                                <button
                                    onClick={() => handleCreateLineChart(config)}
                                    disabled={config.token.targetIds.length === 0}
                                    className={cn(
                                        "flex items-center gap-3 px-3 py-0.5 rounded text-xs bg-transparent",
                                        chartType === "line" && "bg-popover border"
                                    )}
                                >
                                    <ChartLine className="w-4 h-4" />
                                    Line
                                </button>
                            </div>

                            <DecoderSelector />
                        </div>



                        <div className={cn(
                            "size-full",
                            chartType === "heatmap" ? "opacity-50 pointer-events-none" : "pointer-events-auto"
                        )}>
                            <PredictionBadges
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