"use client";

import { useQuery } from "@tanstack/react-query";
import { getModels } from "@/lib/api/modelsApi";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export function ModelsDisplay() {
    const {
        data: models = [],
        isLoading,
        error,
    } = useQuery({
        queryKey: ["models"],
        queryFn: getModels,
        refetchInterval: 120000,
    });

    const baseModels = models.filter(model => model.type === "base");
    const chatModels = models.filter(model => model.type === "chat");

    if (isLoading) {
        return (
            <div className="mb-6 p-4 border rounded bg-gray-50">
                <h2 className="text-lg font-semibold mb-3">Available Models</h2>
                <div className="text-sm text-gray-500">Loading models...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="mb-6 p-4 border rounded bg-destructive/10 border-destructive/20">
                <h2 className="text-lg font-semibold mb-3 text-destructive">Available Models</h2>
                <div className="text-sm text-destructive/80">
                    Error loading models: {error.message}
                </div>
            </div>
        );
    }

    return (
        <div className="mb-6 p-4 border rounded bg-primary/10 border-primary/20">
            <h2 className="text-lg font-semibold mb-3 text-primary">Available Models</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Base Models */}
                <div>
                    <h3 className="font-medium text-primary/80 mb-3">
                        Base Models ({baseModels.length})
                    </h3>
                    {baseModels.length > 0 ? (
                        <div className="space-y-1">
                            {baseModels.map((model) => (
                                !model.allowed ? (
                                    <Tooltip key={model.name}>
                                        <TooltipTrigger asChild>
                                            <div 
                                                className="text-sm px-3 py-2 rounded border bg-gray-100 text-gray-400 opacity-60"
                                            >
                                                <div className="flex items-center gap-2">
                                                    {model.name}
                                                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                                </div>
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent 
                                            className="bg-yellow-100 text-yellow-900 [&]:!bg-yellow-100" 
                                            style={{backgroundColor: "rgb(254 249 195)"}}
                                        >
                                            Log in to use this model.
                                        </TooltipContent>
                                    </Tooltip>
                                ) : (
                                    <a
                                        href={`https://huggingface.co/${model.name}`}
                                        key={model.name}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        <div className="text-sm bg-background px-3 py-2 rounded border hover:underline">
                                            {model.name}
                                        </div>
                                    </a>
                                )
                            ))}
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground italic">
                            No base models available
                        </div>
                    )}
                </div>

                {/* Chat Models */}
                <div>
                    <h3 className="font-medium text-primary/80 mb-3">
                        Chat Models ({chatModels.length})
                    </h3>
                    {chatModels.length > 0 ? (
                        <div className="space-y-1">
                            {chatModels.map((model) => (
                                !model.allowed ? (
                                    <Tooltip key={model.name}>
                                        <TooltipTrigger asChild>
                                            <div 
                                                className="text-sm px-3 py-2 rounded border bg-gray-100 text-gray-400 opacity-60"
                                            >
                                                <div className="flex items-center gap-2">
                                                    {model.name}
                                                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                                </div>
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent 
                                            className="bg-yellow-100 text-yellow-900 [&]:!bg-yellow-100" 
                                            style={{backgroundColor: "rgb(254 249 195)"}}
                                        >
                                            Log in to use this model.
                                        </TooltipContent>
                                    </Tooltip>
                                ) : (
                                    <a
                                        href={`https://huggingface.co/${model.name}`}
                                        key={model.name}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        <div className="text-sm bg-background px-3 py-2 rounded border hover:underline">
                                            {model.name}
                                        </div>
                                    </a>
                                )
                            ))}
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground italic">
                            No chat models available
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-3 text-xs text-primary/70">
                Total: {models.length} model{models.length !== 1 ? "s" : ""} available
            </div>
        </div>
    );
}
