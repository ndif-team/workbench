"use client";

import { useGenerate } from "@/lib/api/modelsApi";
import { Token } from "@/types/models";
import { LensConfigData } from "@/types/lens";
import { useState } from "react";
import type { GenerationResponse } from "@/lib/api/modelsApi";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CornerDownLeft, ChevronDown, Loader2 } from "lucide-react";
import { useUpdateChartConfig } from "@/lib/api/configApi";
import { useParams } from "next/navigation";

interface GenerateButtonProps {
  configId: string;
  config: LensConfigData;
  setConfig: (config: LensConfigData) => void;
  setTokenData: (tokenData: Token[]) => void;
  setEditingText: (editingText: boolean) => void;
  handleTokenize: () => void;
  isExecuting: boolean;
  selectedModel: string;
  handleCreateHeatmap: (config: LensConfigData) => Promise<unknown>;
}

export default function GenerateButton({
  configId,
  config,
  setConfig,
  setTokenData,
  setEditingText,
  isExecuting,
  handleTokenize,
  selectedModel,
  handleCreateHeatmap,
}: GenerateButtonProps) {
  const [maxNewTokens, setMaxNewTokens] = useState(10);
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { mutateAsync: generate, isPending: isGenerating } = useGenerate();
  const { mutateAsync: updateChartConfigMutation } = useUpdateChartConfig();

  const handleGenerate = async () => {
    const { completion, last_token_prediction }: GenerationResponse = await generate({
      prompt: config.prompt,
      max_new_tokens: maxNewTokens,
      model: selectedModel,
    });

    setTokenData(completion);
    const newConfig = {
      ...config,
      model: selectedModel,
      prompt: completion.map((token) => token.text).join(""),
      prediction: last_token_prediction,
      token: {
        idx: completion.length - 1,
        id: completion[completion.length - 1].id,
        text: completion[completion.length - 1].text,
        targetIds: last_token_prediction.ids.slice(0, 3),
      },
    };

    // If there weren't existing predictions, create a heatmap
    if (!config.prediction) {
      handleCreateHeatmap(newConfig);
    }
    setConfig(newConfig);

    // Update the config in the database
    await updateChartConfigMutation({
      configId: configId,
      config: {
        data: newConfig,
        workspaceId,
        type: "lens",
      },
    });

    setEditingText(false);
  };

  return (
    <div className="flex items-center h-fit w-fit rounded">
      <button
        id="tokenize-button"
        type="button"
        onClick={() => {
          handleTokenize();
        }}
        disabled={isExecuting || isGenerating || !config.prompt}
        className="rounded-l border items-center hover:bg-accent disabled:opacity-50 disabled:hover:bg-muted transition-all duration-100 bg-muted justify-center flex h-8 w-8"
      >
        {isExecuting || isGenerating ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <CornerDownLeft className="w-4 h-4" />
        )}
      </button>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="rounded-l-none rounded-r border-r hover:bg-accent disabled:opacity-50 disabled:hover:bg-muted transition-all duration-100 border-y bg-muted h-8 w-4 flex items-center justify-center"
            disabled={isExecuting || isGenerating || !config.prompt}
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-fit p-0 border-none">
          <div className="flex items-center w-fit border h-auto rounded">
            <button
              className="rounded-l hover:bg-accent transition-all h-full border-r duration-100"
              onClick={handleGenerate}
            >
              <div className="flex items-start justify-center flex-col px-3 py-3 gap-0.5 py-auto">
                <span className="text-sm flex items-center gap-3">Generate</span>
                <span className="text-xs text-muted-foreground">Max new tokens</span>
              </div>
            </button>
            <input
              className="rounded-r focus:outline-none h-full text-center placeholder:text-center w-10 bg-transparent text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              max={20}
              min={1}
              type="number"
              value={maxNewTokens}
              onChange={(e) => setMaxNewTokens(Number(e.target.value))}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
