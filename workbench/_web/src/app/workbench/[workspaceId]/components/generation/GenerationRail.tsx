"use client";

import { useCallback, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "@/stores/useWorkspace";
import { useGenerationPanel } from "@/stores/useGenerationPanel";
import { getModels, generateCompletion } from "@/lib/api/modelsApi";
import { encodeText } from "@/actions/tok";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Trash2, PanelRightClose } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    DEFAULT_GENERATION_PARAMS,
    type GenerationItem,
    type GenerationParams,
    type GenerationViewMode,
} from "@/types/generation";
import { GenerationTimeline } from "./GenerationTimeline";
import { GenerationComposer } from "./GenerationComposer";
import { TokenTextToggle } from "./TokenTextToggle";

interface GenerationRailProps {
    className?: string;
    onCollapse?: () => void;
}

export function GenerationRail({ className, onCollapse }: GenerationRailProps) {
    const { workspaceId } = useParams<{ workspaceId: string }>();
    const { selectedModelIdx } = useWorkspace();

    const { data: models } = useQuery({
        queryKey: ["models"],
        queryFn: getModels,
    });

    const selectedModel = useMemo(() => {
        if (!models || models.length === 0) return undefined;
        return models[selectedModelIdx] ?? models[0];
    }, [models, selectedModelIdx]);

    const modelName = selectedModel?.name;
    const allowed = selectedModel?.allowed ?? true;

    const buckets = useGenerationPanel((s) => s.buckets);
    const viewMode = useGenerationPanel((s) => s.viewMode);
    const setViewMode = useGenerationPanel((s) => s.setViewMode);
    const addPending = useGenerationPanel((s) => s.addPending);
    const setStatus = useGenerationPanel((s) => s.setStatus);
    const removeItem = useGenerationPanel((s) => s.removeItem);
    const clearItems = useGenerationPanel((s) => s.clearItems);
    const updateParams = useGenerationPanel((s) => s.updateParams);

    const bucketKey = workspaceId && modelName ? `${workspaceId}::${modelName}` : null;
    const bucket = bucketKey ? buckets[bucketKey] : undefined;
    const items: GenerationItem[] = bucket?.items ?? [];
    const params: GenerationParams = bucket?.params ?? DEFAULT_GENERATION_PARAMS;
    const isPending = items.some((it) => it.status === "pending");

    const handleSubmit = useCallback(
        async (prompt: string, useParams: GenerationParams) => {
            if (!workspaceId || !modelName) return;
            const id = addPending(workspaceId, modelName, prompt, useParams);
            try {
                // The prompt isn't echoed in the generate response, so tokenize it
                // in parallel with generation (overlaps the slower call → no added
                // latency). Saving the full prompt+generation token sequence lets
                // token view render both — seed and completion — with no tokenize
                // call at display time. Empty array if tokenization fails.
                const promptTokensPromise = encodeText(prompt, modelName, false)
                    .then((toks) => toks.map((t) => t.text))
                    .catch(() => [] as string[]);

                const response = await generateCompletion({
                    prompt,
                    max_new_tokens: useParams.maxNewTokens,
                    model: modelName,
                    ...(useParams.sampling
                        ? {
                              temperature: useParams.temperature,
                              top_p: useParams.topP,
                              top_k: useParams.topK > 0 ? useParams.topK : undefined,
                          }
                        : {}),
                    stop_strings:
                        useParams.stopSequences.length > 0 ? useParams.stopSequences : undefined,
                });

                const promptTokenTexts = await promptTokensPromise;
                const completionTokenTexts = response.completion.map((t) => t.text);

                const patch: Partial<GenerationItem> = {
                    output: completionTokenTexts.join(""),
                    outputTokens: completionTokenTexts.length,
                    completionTokens: completionTokenTexts,
                };
                // Save the prompt's tokens too when available. Missing only if
                // prompt tokenization failed for a non-empty prompt — then leave
                // it unsaved so token view tokenizes the prompt on demand.
                if (promptTokenTexts.length > 0 || prompt.length === 0) {
                    patch.seedTokens = promptTokenTexts;
                }
                setStatus(workspaceId, modelName, id, "success", patch);
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : "Generation failed. Please try again.";
                setStatus(workspaceId, modelName, id, "error", { error: message });
            }
        },
        [workspaceId, modelName, addPending, setStatus],
    );

    if (!workspaceId) return null;

    return (
        <aside
            aria-label="Text generation"
            className={cn("relative flex h-full min-w-0 flex-col", className)}
        >
            <RailHeader
                count={items.length}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                onClear={
                    items.length > 0 && modelName
                        ? () => clearItems(workspaceId, modelName)
                        : undefined
                }
                onCollapse={onCollapse}
            />

            <ModelGuard model={modelName} allowed={allowed}>
                <GenerationTimeline
                    items={items}
                    viewMode={viewMode}
                    modelName={modelName}
                    onRemove={(id) => modelName && removeItem(workspaceId, modelName, id)}
                    onRegenerate={(item) => modelName && handleSubmit(item.prompt, item.params)}
                />

                <div className="border-t bg-background/50 p-3">
                    <GenerationComposer
                        params={params}
                        onParamsChange={(patch) =>
                            modelName && updateParams(workspaceId, modelName, patch)
                        }
                        onSubmit={(prompt) => handleSubmit(prompt, params)}
                        isPending={isPending}
                        disabled={!modelName || !allowed}
                        placeholder={
                            modelName ? `Prompt ${truncateModel(modelName)}…` : "Loading model…"
                        }
                    />
                </div>
            </ModelGuard>
        </aside>
    );
}

function RailHeader({
    count,
    viewMode,
    onViewModeChange,
    onClear,
    onCollapse,
}: {
    count: number;
    viewMode: GenerationViewMode;
    onViewModeChange: (viewMode: GenerationViewMode) => void;
    onClear?: () => void;
    onCollapse?: () => void;
}) {
    return (
        <div className="p-3 border-b flex items-center justify-between gap-2">
            <h2 className="text-sm pl-2 font-medium">Generation</h2>
            <div className="flex items-center gap-1.5">
                {count > 0 && <TokenTextToggle value={viewMode} onChange={onViewModeChange} />}
                {onClear && <ClearHistoryButton count={count} onConfirm={onClear} />}
                {onCollapse && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 text-muted-foreground hover:text-foreground"
                                onClick={onCollapse}
                                aria-label="Collapse panel"
                            >
                                <PanelRightClose className="size-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                            Collapse
                        </TooltipContent>
                    </Tooltip>
                )}
            </div>
        </div>
    );
}

function ClearHistoryButton({ count, onConfirm }: { count: number; onConfirm: () => void }) {
    const [open, setOpen] = useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            aria-label="Clear history"
                        >
                            <Trash2 className="size-3.5" />
                        </Button>
                    </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                    Clear history
                </TooltipContent>
            </Tooltip>
            <PopoverContent align="end" sideOffset={8} className="w-64 rounded-md p-3">
                <p className="text-sm font-medium leading-none">
                    Clear {count} generation{count === 1 ? "" : "s"}?
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                    This only clears the panel for this model. It can&rsquo;t be undone.
                </p>
                <div className="mt-3 flex justify-end gap-1.5">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                            onConfirm();
                            setOpen(false);
                        }}
                    >
                        Clear
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}

function ModelGuard({
    model,
    allowed,
    children,
}: {
    model?: string;
    allowed: boolean;
    children: React.ReactNode;
}) {
    if (!model) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <div className="size-7 animate-pulse rounded-full bg-muted" />
                <p className="mt-3 text-xs text-muted-foreground">Loading model…</p>
            </div>
        );
    }
    if (!allowed) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <p className="text-sm font-medium">Sign in required</p>
                <p className="mt-1.5 max-w-[28ch] text-xs text-muted-foreground">
                    This model is gated. Sign in to generate.
                </p>
            </div>
        );
    }
    return <>{children}</>;
}

function truncateModel(name: string) {
    const slash = name.lastIndexOf("/");
    return slash >= 0 ? name.slice(slash + 1) : name;
}
