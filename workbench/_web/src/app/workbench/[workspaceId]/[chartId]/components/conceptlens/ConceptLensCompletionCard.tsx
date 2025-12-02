"use client";

import { Grid3x3, Loader2, TriangleAlert } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { TokenArea } from "../lens/TokenArea";
import { useState, useEffect, useRef } from "react";
import { usePrediction } from "@/lib/api/modelsApi";
import type { ConceptLensConfigData } from "@/types/lens";
import { encodeText } from "@/actions/tok";
import { useUpdateChartConfig } from "@/lib/api/configApi";
import { useParams } from "next/navigation";
import { useConceptLensGrid } from "@/lib/api/chartApi";
import { cn } from "@/lib/utils";
import { ConceptLensConfig } from "@/db/schema";
import { ChartType } from "@/types/charts";
import { Token } from "@/types/models";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import GenerateButton from "../lens/GenerateButton";

interface ConceptLensCompletionCardProps {
    initialConfig: ConceptLensConfig;
    chartType: ChartType;
    selectedModel: string;
}

export function ConceptLensCompletionCard({
    initialConfig,
    chartType,
    selectedModel,
}: ConceptLensCompletionCardProps) {
    const { workspaceId, chartId } = useParams<{ workspaceId: string; chartId: string }>();

    const [tokenData, setTokenData] = useState<Token[]>([]);

    const [config, setConfig] = useState<ConceptLensConfigData>(() => ({
        ...initialConfig.data,
    }));

    const [editingText, setEditingText] = useState(initialConfig.data.prediction === undefined);
    const [promptHasChangedState, setPromptHasChanged] = useState(false);

    const shouldAutoRunRef = useRef(
        initialConfig.data.prompt.length > 0 && !initialConfig.data.prediction,
    );
    const hasAutoRunRef = useRef(false);

    const promptHasChanged = promptHasChangedState || config.model !== selectedModel;

    const { mutateAsync: getPrediction, isPending: isExecuting } = usePrediction();
    const { mutateAsync: updateChartConfigMutation } = useUpdateChartConfig();

    const { mutateAsync: createHeatmap, isPending: isCreatingHeatmap } = useConceptLensGrid();

    // Reset promptHasChanged when config changes
    useEffect(() => {
        setPromptHasChanged(false);
        shouldAutoRunRef.current =
            initialConfig.data.prompt.length > 0 && !initialConfig.data.prediction;
        hasAutoRunRef.current = false;
    }, [initialConfig.id, initialConfig.data.prompt.length, initialConfig.data.prediction]);

    // Tokenize the prompt if the config changes and there's an existing prediction
    useEffect(() => {
        const fetchTokens = async () => {
            if (config.prediction) {
                const tokens = await encodeText(config.prompt, selectedModel);
                setTokenData(tokens);
            }
        };
        fetchTokens();
    }, [initialConfig.id, config.prediction, config.prompt, selectedModel]);

    // Auto-run tokenization and heatmap generation
    useEffect(() => {
        const autoRunTokenization = async () => {
            const modelToUse =
                initialConfig.data.model && initialConfig.data.model.length > 0
                    ? initialConfig.data.model
                    : selectedModel;

            if (
                shouldAutoRunRef.current &&
                !hasAutoRunRef.current &&
                modelToUse &&
                modelToUse.length > 0 &&
                !isExecuting &&
                !promptHasChangedState
            ) {
                hasAutoRunRef.current = true;
                shouldAutoRunRef.current = false;

                try {
                    await handleTokenize(true, modelToUse);
                } catch (error) {
                    console.error("Auto-run failed:", error);
                }
            }
        };

        const timer = setTimeout(autoRunTokenization, 800);
        return () => clearTimeout(timer);
    }, [
        selectedModel,
        isExecuting,
        promptHasChangedState,
        initialConfig.data.prompt,
        initialConfig.data.model,
        config.model,
    ]);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const tokenContainerRef = useRef<HTMLDivElement>(null);
    const settingsRef = useRef<HTMLDivElement>(null);

    const escapeTokenArea = async () => {
        setEditingText(true);

        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                const length = textareaRef.current.value.length;
                textareaRef.current.setSelectionRange(length, length);
            }
        }, 0);
    };

    const handleTokenize = async (forceRun = false, modelOverride?: string) => {
        const modelToUse = modelOverride || selectedModel;
        const tokens = await encodeText(config.prompt, modelToUse);

        if (tokens.length <= 1) {
            toast.error("Please enter a longer prompt.");
            return;
        }

        setTokenData(tokens);
        const temporaryConfig: ConceptLensConfigData = {
            ...config,
            model: modelToUse,
            token: { idx: tokens[tokens.length - 1].idx, id: 0, text: "", targetIds: [] },
        };

        if (!promptHasChanged && !forceRun) {
            setEditingText(false);
            return;
        }

        await runPredictions(temporaryConfig);
        await handleCreateHeatmap(temporaryConfig);
        setPromptHasChanged(false);
    };

    const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setConfig({
            ...config,
            prompt: e.target.value,
        });
        if (!promptHasChanged) setPromptHasChanged(true);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey && !isExecuting && config.prompt.length > 0) {
            if (promptHasChanged) {
                e.preventDefault();
                handleTokenize();
            } else {
                setEditingText(false);
            }
        }
    };

    const autoResizeTextarea = () => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    };
    useEffect(() => {
        if (editingText) autoResizeTextarea();
    }, [config.prompt, editingText]);

    const handleTextareaBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
        if (!config.prediction) return;

        setTimeout(() => {
            const activeElement = document.activeElement;
            const withinTextarea = activeElement && textareaRef.current?.contains(activeElement);
            const withinToken = activeElement && tokenContainerRef.current?.contains(activeElement);
            const withinSettings = activeElement && settingsRef.current?.contains(activeElement);
            const popoverOpen = document.querySelector("[data-radix-popper-content-wrapper]");

            if (withinTextarea || withinToken || withinSettings || popoverOpen) return;

            setEditingText(false);
        }, 0);
    };

    const runPredictions = async (temporaryConfig: ConceptLensConfigData) => {
        const prediction = await getPrediction(temporaryConfig);
        const topThree = prediction.ids.slice(0, 3);

        temporaryConfig.prediction = prediction;
        temporaryConfig.token.targetIds = topThree;
        setConfig(temporaryConfig);

        await updateChartConfigMutation({
            configId: initialConfig.id,
            chartId: chartId,
            config: {
                data: temporaryConfig,
                workspaceId,
                type: "concept-lens",
            },
        });

        setEditingText(false);
    };

    const handleCreateHeatmap = async (configToUse: ConceptLensConfigData) => {
        const data = await createHeatmap({
            lensRequest: {
                completion: configToUse,
                chartId: chartId,
            },
            configId: initialConfig.id,
        });

        await updateChartConfigMutation({
            configId: initialConfig.id,
            config: {
                data: configToUse,
                workspaceId: workspaceId as string,
                type: "concept-lens",
            },
        });

        return data;
    };

    const handleTokenClick = async (event: React.MouseEvent<HTMLDivElement>, idx: number) => {
        event.preventDefault();
        event.stopPropagation();

        if (config.token.idx === idx) return;

        const temporaryConfig: ConceptLensConfigData = {
            ...config,
            token: { idx, id: 0, text: "", targetIds: [] },
        };

        await runPredictions(temporaryConfig);
        setConfig(temporaryConfig);
        await handleCreateHeatmap(temporaryConfig);
    };

    return (
        <div className="flex flex-col w-full gap-3">
            <div className="flex flex-col size-full relative">
                {editingText ? (
                    <Textarea
                        ref={textareaRef}
                        value={config.prompt}
                        onChange={(e) => {
                            handlePromptChange(e);
                            autoResizeTextarea();
                        }}
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
                            isExecuting ? "cursor-progress" : "cursor-text",
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
                            showFill={false}
                        />
                    </div>
                )}
                {config.model !== selectedModel && tokenData.length > 0 && !isExecuting && (
                    <Tooltip>
                        <TooltipTrigger className="absolute bottom-2 right-2">
                            <TriangleAlert className="w-4 h-4 text-destructive/70" />
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                            <p className="w-36 text-wrap text-center">
                                The displayed tokenization does not match the selected model. Please
                                retokenize.
                            </p>
                        </TooltipContent>
                    </Tooltip>
                )}
                <div
                    ref={settingsRef}
                    className="absolute bottom-2 right-2 flex items-center gap-3"
                >
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
                            toolType="concept-lens"
                        />
                    )}
                </div>
            </div>

            {config.prediction && (
                <div
                    className={cn(
                        "transition-all",
                        editingText || isExecuting ? "opacity-60 blur-[0.25px]" : "opacity-100",
                        isExecuting && "!cursor-progress",
                        editingText && "cursor-pointer",
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
                    <div
                        className={cn(
                            "flex flex-col size-full border p-3 items-center gap-3 bg-card/80 rounded",
                            editingText || isExecuting
                                ? "pointer-events-none"
                                : "pointer-events-auto",
                        )}
                    >
                        <div className="flex w-full justify-between items-center gap-2 flex-wrap min-w-60">
                            <div className="flex items-center p-1 h-8 bg-background rounded flex-shrink-0">
                                <button
                                    onClick={() => handleCreateHeatmap(config)}
                                    disabled={isExecuting || isCreatingHeatmap}
                                    className={cn(
                                        "relative overflow-hidden flex items-center gap-2 px-3 py-0.5 rounded text-xs bg-transparent",
                                        (chartType === "heatmap" || isCreatingHeatmap) &&
                                            "bg-popover border",
                                    )}
                                >
                                    {isCreatingHeatmap ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Grid3x3 className="w-4 h-4" />
                                    )}
                                    Heatmap
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

