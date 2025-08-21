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
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/stores/useWorkspace";
import { useQuery } from "@tanstack/react-query";
import { getModels } from "@/lib/api/modelsApi";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ModelSelector() {
    const { selectedModelIdx, setSelectedModelIdx } = useWorkspace();

    const { data: models, isLoading } = useQuery({
        queryKey: ['models'],
        queryFn: getModels,
        refetchInterval: 120000,
    });

    if (!models) {
        return <div>Loading models...</div>;
    }

    const baseModels = models.filter(model => model.type === "base").map(model => model.name);
    const chatModels = models.filter(model => model.type === "chat").map(model => model.name);

    const handleModelChange = (modelName: string) => {
        const model = models.find(model => model.name === modelName);
        if (model) {
            setSelectedModelIdx(models.indexOf(model));
        }
    };

    return (
        <Select value={models[selectedModelIdx].name} onValueChange={handleModelChange}>


            <Tooltip>
                <TooltipTrigger asChild>
                    <SelectTrigger className={cn("w-fit gap-3", {
                        "animate-pulse": isLoading
                    })}>
                        <SelectValue placeholder="Select a model" />
                    </SelectTrigger>    
                </TooltipTrigger>
                <TooltipContent>Select a model to use for predictions.</TooltipContent>
            </Tooltip>

            <SelectContent>
                {baseModels.length > 0 && (
                    <SelectGroup>
                        <SelectLabel>Base Models</SelectLabel>
                        {baseModels.map((model) => (
                            <SelectItem key={model} value={model}>{model}</SelectItem>
                        ))}
                    </SelectGroup>
                )}
                {chatModels.length > 0 && (
                    <SelectGroup>
                        <SelectLabel>Chat Models</SelectLabel>
                        {chatModels.map((model) => (
                            <SelectItem key={model} value={model}>{model}</SelectItem>
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
