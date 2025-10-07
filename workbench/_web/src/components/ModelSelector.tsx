import * as React from "react"

import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/stores/useWorkspace";
import { useQuery } from "@tanstack/react-query";
import { getModels } from "@/lib/api/modelsApi";

export function ModelSelector() {
    const { selectedModelIdx, setSelectedModelIdx } = useWorkspace();

    const { data: models, isLoading } = useQuery({
        queryKey: ['models'],
        queryFn: getModels,
        refetchInterval: 120000,
    });

    if (!models) {
        return <div className="h-8 animate-pulse bg-muted/50" />
    }

    const baseModels = models.filter(model => model.type === "base");
    const chatModels = models.filter(model => model.type === "chat");

    const handleModelChange = (modelName: string) => {
        const model = models.find(model => model.name === modelName);
        if (model) {
            setSelectedModelIdx(models.indexOf(model));
        }
    };

    return (
        <Select value={models[selectedModelIdx].name} onValueChange={handleModelChange}>
            <SelectTrigger className={cn("w-fit gap-3", {
                "animate-pulse": isLoading
            })}>
                <SelectValue placeholder="Select a model" />
            </SelectTrigger>

            <SelectContent>
                {baseModels.length > 0 && (
                    <SelectGroup>
                        <SelectLabel>Base Models</SelectLabel>
                        {baseModels.map((model) => (
                            !model.allowed ? (
                                <Tooltip key={model.name}>
                                    <TooltipTrigger asChild>
                                        <div>
                                            <SelectItem 
                                                value={model.name}
                                                disabled={!model.allowed}
                                                className={cn("opacity-50 cursor-not-allowed")}
                                            >
                                                <div className="flex items-center gap-2">
                                                    {model.name}
                                                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                                </div>
                                            </SelectItem>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent 
                                        className="bg-yellow-100 text-yellow-900" 
                                        style={{backgroundColor: "rgb(254 249 195)"}}
                                    >
                                        Log in to use this model.
                                    </TooltipContent>
                                </Tooltip>
                            ) : (
                                <SelectItem 
                                    key={model.name}
                                    value={model.name}
                                >
                                    {model.name}
                                </SelectItem>
                            )
                        ))}
                    </SelectGroup>
                )}
                {chatModels.length > 0 && (
                    <SelectGroup>
                        <SelectLabel>Chat Models</SelectLabel>
                        {chatModels.map((model) => (
                            !model.allowed ? (
                                <Tooltip key={model.name}>
                                    <TooltipTrigger asChild>
                                        <div>
                                            <SelectItem 
                                                value={model.name}
                                                disabled={!model.allowed}
                                                className={cn("opacity-50 cursor-not-allowed")}
                                            >
                                                <div className="flex items-center gap-2">
                                                    {model.name}
                                                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                                </div>
                                            </SelectItem>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent 
                                        className="bg-yellow-100 text-yellow-900" 
                                        style={{backgroundColor: "rgb(254 249 195)"}}
                                    >
                                        Log in to use this model.
                                    </TooltipContent>
                                </Tooltip>
                            ) : (
                                <SelectItem 
                                    key={model.name}
                                    value={model.name}
                                >
                                    {model.name}
                                </SelectItem>
                            )
                        ))}
                    </SelectGroup>
                )}
                {isLoading && (
                    <SelectItem value="loading" disabled>Loading models...</SelectItem>
                )}
            </SelectContent>
        </Select>
    )
}
