"use client";

import { ChartLine, Grid3x3, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TokenArea } from "./TokenArea";
import { useState, useEffect, useRef } from "react";
import { useExecuteSelected } from "@/lib/api/modelsApi";
import type { Prediction } from "@/types/models";
import type { LensConfigData } from "@/types/lens";

import { PredictionBadges } from "./PredictionBadges";

import { encodeText } from "@/actions/tokenize";
import { useUpdateChartConfig } from "@/lib/api/configApi";
import { useParams } from "next/navigation";
import { useLensCharts } from "@/hooks/useLensCharts";
import { cn } from "@/lib/utils";
import { useLensWorkspace } from "@/stores/useLensWorkspace";

import { LensConfig } from "@/db/schema";

interface CompletionCardProps {
    initialConfig: LensConfig;
}

export function CompletionCard({ initialConfig }: CompletionCardProps) {
    const { workspaceId } = useParams<{ workspaceId: string }>();
    const { tokenData, setTokenData } = useLensWorkspace();

    const [predictions, setPredictions] = useState<Prediction[]>([]);

    // Workspace display state
    const [showTokenArea, setShowTokenArea] = useState(false);
    const [isSelectingToken, setIsSelectingToken] = useState(false);

    const { mutateAsync: getExecuteSelected, isPending: isExecuting } = useExecuteSelected();
    const { mutateAsync: updateChartConfigMutation } = useUpdateChartConfig();


    const [config, setConfig] = useState<LensConfigData>(initialConfig.data);
    const configId = initialConfig.id;

    const { handleCreateLineChart, handleCreateHeatmap } = useLensCharts({ config, configId });


    const init = useRef(false);
    useEffect(() => {
        if (init.current) return;
        if (config.token.targetIds.length > 0) {
            handleInit();
        }
    }, []);

    // If targetIds already exist, run with the initial config
    const handleInit = async () => {
        const tokens = await encodeText(config.prompt, config.model);
        setTokenData(tokens);
        setShowTokenArea(true);
        await runPredictions(config);
    }

    const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setConfig({
            ...config,
            prompt: e.target.value,
        });
    };

    const handleTokenize = async () => {
        const tokens = await encodeText(config.prompt, config.model);
        setTokenData(tokens);
        setShowTokenArea(true);

        // Set the token to the last token in the list
        const temporaryConfig: LensConfigData = {
            ...config,
            token: { idx: tokens[tokens.length - 1].idx, id: 0, text: "", targetIds: [] }
        }

        // Run predictions
        await runPredictions(temporaryConfig);
        await handleCreateHeatmap();
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleTokenize();
        }
    };

    const runPredictions = async (temporaryConfig: LensConfigData) => {
        const data = await getExecuteSelected(temporaryConfig);
        setPredictions(data);
        setConfig(temporaryConfig);
        await updateChartConfigMutation({
            configId,
            config: {
                data: temporaryConfig,
                workspaceId,
                type: "lens",
            }
        });
    }

    const handleTokenClick = async (idx: number) => {
        // Skip if the token is already selected
        if (config.token.idx === idx || !isSelectingToken) return;

        setConfig({
            ...config,
            token: { idx, id: 0, text: "", targetIds: [] },
        });

        setIsSelectingToken(false);

        // Set the token to the last token in the list
        const temporaryConfig: LensConfigData = {
            ...config,
            token: { idx, id: 0, text: "", targetIds: [] }
        }

        // Run predictions
        await runPredictions(temporaryConfig);
    };

    const handleClear = async () => {
        const cleanedConfig: LensConfigData = {
            ...config,
            token: { idx: 0, id: 0, text: "", targetIds: [] },
        }
        await updateChartConfigMutation({
            configId,
            config: {
                data: cleanedConfig,
                workspaceId,
                type: "lens",
            }
        });
        setConfig(cleanedConfig);
        setTokenData([]);
        setShowTokenArea(false);
        setPredictions([]);
    }

    return (
        <div className="flex flex-col w-full">
            {/* Content */}
            <div className="flex size-full relative">
                {!showTokenArea ? (
                    <Textarea
                        value={config.prompt}
                        onChange={handlePromptChange}
                        onKeyDown={handleKeyDown}
                        className="w-full h-24"
                        placeholder="Enter your prompt here."
                        data-testid="prompt-textarea"
                        aria-label="Prompt Textarea"
                    />
                ) : (
                    <div
                        className={cn(
                            "flex w-full h-24 px-3 py-2 border overflow-y-auto",
                            showTokenArea ? "rounded-t-lg" : "rounded-lg"
                        )}
                        data-testid="token-area-container"
                        aria-label="Token Area Container"
                    >
                        <TokenArea
                            config={config}
                            handleTokenClick={handleTokenClick}
                            tokenData={tokenData}
                            isSelectingToken={isSelectingToken}
                        />
                    </div>
                )}
                <Button
                    variant="outline"
                    size="sm"
                    id="tokenize-button"
                    onClick={handleTokenize}
                    className="absolute bottom-2 right-2"
                    data-testid="tokenize-button"
                    aria-label="Tokenize"
                >
                    Tokenize
                </Button>

            </div>

            {(showTokenArea && predictions.length > 0 && !isExecuting) && (
                <div
                    className="border-x border-b p-2 flex items-center justify-between bg-muted rounded-b-lg transition-all duration-200 ease-in-out animate-in slide-in-from-top-2"
                >
                    <div className="flex gap-2 items-start flex-1">
                        <Button
                            size="icon"
                            onClick={handleCreateHeatmap}
                            data-testid="create-heatmap-button"
                            aria-label="Create Heatmap"
                        >
                            <Grid3x3 className="w-4 h-4" />
                        </Button>
                        <Button
                            size="icon"
                            onClick={handleCreateLineChart}
                            disabled={config.token.targetIds.length === 0}
                            data-testid="create-line-button"
                            aria-label="Create Line Chart"
                        >
                            <ChartLine className="w-4 h-4" />
                        </Button>
                        <PredictionBadges
                            config={config}
                            setConfig={setConfig}
                            predictions={predictions}
                        />
                    </div>

                </div>
            )}
        </div>
    );
}