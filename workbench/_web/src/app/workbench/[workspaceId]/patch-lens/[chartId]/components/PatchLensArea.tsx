"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { useCapture } from "@/lib/analytics";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2, Play, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useTour } from "@reactour/tour";
import { PatchLensTutorial } from "@/tutorials/patchLens";
import { usePatchLensTutorial, hydratePatchLensTutorial } from "@/stores/usePatchLensTutorial";
import { getModels } from "@/lib/api/modelsApi";
import { useWorkspaceWorkshop } from "@/lib/api/workshopApi";
import { useWorkspace } from "@/stores/useWorkspace";
import { encodeText } from "@/actions/tok";
import { TokenizerLoadError } from "@/actions/errors";
import { Token } from "@/types/models";
import { PatchPromptSection } from "@/components/activation-patching/toolkit";
import { toast } from "sonner";
import { usePatchLensLogitLens, PatchLensResult } from "@/lib/api/patchLensApi";
import { finalPrediction } from "@/lib/lens-last-row";
import type { NormalizedRun } from "@/lib/lensRun";
import { LensHistoryRail } from "./LensHistoryRail";

// Default model for the CM intro. 32 layers reads as a manageable heatmap;
// index 0 in the model list is the 70B (80 layers), far too many for a primer.
const DEFAULT_INTRO_MODEL = "meta-llama/Llama-3.1-8B";

interface PatchLensAreaProps {
    sourcePrompt: string;
    targetPrompt: string;
    onSourcePromptChange: (value: string) => void;
    onTargetPromptChange: (value: string) => void;
    onLensResult?: (result: PatchLensResult, runSrc: string, runTgt: string) => void;
    lensResult?: PatchLensResult | null;
    lastRunSrcPrompt?: string | null;
    lastRunTgtPrompt?: string | null;
    // Bumped each time a history entry is restored. Tells the area to re-tokenize
    // both prompts and show the chip view, since the prompt props change without
    // the textarea blur that normally drives tokenization.
    restoreNonce?: number;
    // Restore a history entry onto the tool. When provided, the prompt-history
    // list renders at the bottom of this controls column.
    onSelectRun?: (run: NormalizedRun) => void;
}

function useTutorialAutoStart() {
    const { setSteps, setIsOpen, isOpen } = useTour();
    const { completed, markCompleted } = usePatchLensTutorial();
    // Auto-start fires at most once per mount; dismissing then resaving the
    // localStorage flag prevents a popup loop (same pattern as lens-intro).
    const autoStartedRef = useRef(false);

    useEffect(() => {
        hydratePatchLensTutorial();
    }, []);

    useEffect(() => {
        if (autoStartedRef.current || completed || isOpen) return;
        if (!setSteps || !setIsOpen) return;
        autoStartedRef.current = true;
        const steps = PatchLensTutorial.chapters[0]?.steps ?? [];
        setSteps(steps);
        const id = setTimeout(() => {
            setIsOpen(true);
            markCompleted();
        }, 600);
        return () => clearTimeout(id);
    }, [completed, isOpen, setSteps, setIsOpen, markCompleted]);

    const startTutorial = () => {
        if (!setSteps || !setIsOpen) return;
        const steps = PatchLensTutorial.chapters[0]?.steps ?? [];
        setSteps(steps);
        setIsOpen(true);
    };

    return { startTutorial };
}

export default function PatchLensArea({
    sourcePrompt,
    targetPrompt,
    onSourcePromptChange,
    onTargetPromptChange,
    onLensResult,
    lensResult,
    lastRunSrcPrompt,
    lastRunTgtPrompt,
    restoreNonce,
    onSelectRun,
}: PatchLensAreaProps) {
    const { chartId, workspaceId } = useParams<{ chartId: string; workspaceId: string }>();
    const capture = useCapture();
    const { selectedModelIdx, setSelectedModelIdx } = useWorkspace();

    const { data: models } = useQuery({
        queryKey: ["models"],
        queryFn: getModels,
        refetchInterval: 120000,
    });

    // Workshop workspaces pin the workshop's model; don't fight the pin with
    // the intro default below.
    const { data: workshop, isLoading: workshopLoading } = useWorkspaceWorkshop(
        workspaceId as string,
    );

    // Default to Llama-3.1-8B once when models load, rather than leaving the
    // workspace default at index 0 (the 70B, 80 layers). Guarded so a later
    // manual model choice is not overridden. Waits for the workshop lookup so
    // a workshop's pinned model wins the race over the intro default.
    const didDefaultModel = useRef(false);
    useEffect(() => {
        if (didDefaultModel.current || !models || models.length === 0 || workshopLoading) return;
        didDefaultModel.current = true;
        const targetModel = workshop ? workshop.model : DEFAULT_INTRO_MODEL;
        const idx = models.findIndex((m) => m.name === targetModel);
        if (idx !== -1 && idx !== selectedModelIdx) {
            setSelectedModelIdx(idx);
        }
    }, [models, selectedModelIdx, setSelectedModelIdx, workshop, workshopLoading]);

    const selectedModel = useMemo(() => {
        if (!models || models.length === 0) return undefined;
        return models[selectedModelIdx]?.name || models[0].name;
    }, [models, selectedModelIdx]);

    // Source prompt state
    const [srcTokens, setSrcTokens] = useState<Token[]>([]);
    const [srcEditing, setSrcEditing] = useState(true);
    const [srcTokenizedModel, setSrcTokenizedModel] = useState<string | null>(null);
    const srcTextareaRef = useRef<HTMLTextAreaElement>(null);
    const srcTokenContainerRef = useRef<HTMLDivElement>(null);

    // Target prompt state
    const [tgtTokens, setTgtTokens] = useState<Token[]>([]);
    const [tgtEditing, setTgtEditing] = useState(true);
    const [tgtTokenizedModel, setTgtTokenizedModel] = useState<string | null>(null);
    const tgtTextareaRef = useRef<HTMLTextAreaElement>(null);
    const tgtTokenContainerRef = useRef<HTMLDivElement>(null);

    // Auto-focus the source prompt textarea on first mount so new users
    // can start typing immediately. Only if it's empty (don't steal focus
    // when revisiting a chart that already has prompts).
    const didFocusRef = useRef(false);
    useEffect(() => {
        if (didFocusRef.current) return;
        if (!sourcePrompt) {
            srcTextareaRef.current?.focus();
            didFocusRef.current = true;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const tokenize = useCallback(async (text: string, model: string): Promise<Token[] | null> => {
        try {
            return await encodeText(text, model);
        } catch (error) {
            if (error instanceof TokenizerLoadError) {
                toast.error(
                    `Could not load tokenizer for ${model}. The model may be gated and require authentication.`,
                );
            } else {
                toast.error("Failed to tokenize prompt.");
            }
            return null;
        }
    }, []);

    // Initial tokenize on mount when a model becomes available
    useEffect(() => {
        if (!selectedModel) return;
        const run = async () => {
            if (sourcePrompt) {
                const tokens = await tokenize(sourcePrompt, selectedModel);
                if (tokens && tokens.length > 0) {
                    setSrcTokens(tokens);
                    setSrcTokenizedModel(selectedModel);
                    setSrcEditing(false);
                }
            }
            if (targetPrompt) {
                const tokens = await tokenize(targetPrompt, selectedModel);
                if (tokens && tokens.length > 0) {
                    setTgtTokens(tokens);
                    setTgtTokenizedModel(selectedModel);
                    setTgtEditing(false);
                }
            }
        };
        run();
        // Only auto-tokenize when the model first becomes available
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedModel]);

    // Restoring a history entry swaps the prompt props without a textarea blur,
    // so re-tokenize both prompts and show the chip view. Keyed only on the
    // restore nonce (not the prompt text) so typing doesn't force the chip view.
    useEffect(() => {
        if (!restoreNonce || !selectedModel) return;
        let cancelled = false;
        const run = async () => {
            if (sourcePrompt) {
                const tokens = await tokenize(sourcePrompt, selectedModel);
                if (!cancelled && tokens && tokens.length > 0) {
                    setSrcTokens(tokens);
                    setSrcTokenizedModel(selectedModel);
                    setSrcEditing(false);
                }
            } else {
                setSrcTokens([]);
                setSrcTokenizedModel(null);
                setSrcEditing(true);
            }
            if (targetPrompt) {
                const tokens = await tokenize(targetPrompt, selectedModel);
                if (!cancelled && tokens && tokens.length > 0) {
                    setTgtTokens(tokens);
                    setTgtTokenizedModel(selectedModel);
                    setTgtEditing(false);
                }
            } else {
                setTgtTokens([]);
                setTgtTokenizedModel(null);
                setTgtEditing(true);
            }
        };
        run();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restoreNonce]);

    const handleSrcBlur = useCallback(() => {
        setTimeout(async () => {
            const activeElement = document.activeElement;
            const withinTextarea = activeElement && srcTextareaRef.current?.contains(activeElement);
            const withinToken =
                activeElement && srcTokenContainerRef.current?.contains(activeElement);
            if (withinTextarea || withinToken) return;

            if (!sourcePrompt || !selectedModel) {
                // Clear any stale tokens so the empty state actually reads as
                // empty (otherwise the token display would show the previous
                // tokenization after the user deletes the text).
                setSrcTokens([]);
                setSrcTokenizedModel(null);
                setSrcEditing(true);
                return;
            }
            const tokens = await tokenize(sourcePrompt, selectedModel);
            if (tokens && tokens.length > 0) {
                setSrcTokens(tokens);
                setSrcTokenizedModel(selectedModel);
                setSrcEditing(false);
            }
        }, 100);
    }, [sourcePrompt, selectedModel, tokenize]);

    const handleTgtBlur = useCallback(() => {
        setTimeout(async () => {
            const activeElement = document.activeElement;
            const withinTextarea = activeElement && tgtTextareaRef.current?.contains(activeElement);
            const withinToken =
                activeElement && tgtTokenContainerRef.current?.contains(activeElement);
            if (withinTextarea || withinToken) return;

            if (!targetPrompt || !selectedModel) {
                setTgtTokens([]);
                setTgtTokenizedModel(null);
                setTgtEditing(true);
                return;
            }
            const tokens = await tokenize(targetPrompt, selectedModel);
            if (tokens && tokens.length > 0) {
                setTgtTokens(tokens);
                setTgtTokenizedModel(selectedModel);
                setTgtEditing(false);
            }
        }, 100);
    }, [targetPrompt, selectedModel, tokenize]);

    // Explicit clear handlers so the user has a one-click way to reset a
    // prompt back to empty (deleting characters in the textarea works too,
    // but a button is more discoverable).
    const handleClearSrc = useCallback(() => {
        onSourcePromptChange("");
        setSrcTokens([]);
        setSrcTokenizedModel(null);
        setSrcEditing(true);
        setTimeout(() => srcTextareaRef.current?.focus(), 0);
    }, [onSourcePromptChange]);

    const handleClearTgt = useCallback(() => {
        onTargetPromptChange("");
        setTgtTokens([]);
        setTgtTokenizedModel(null);
        setTgtEditing(true);
        setTimeout(() => tgtTextareaRef.current?.focus(), 0);
    }, [onTargetPromptChange]);

    // Flag stale tokenization for EITHER prompt: the source or the target may
    // have been tokenized with a model that's no longer selected.
    const configModelUnavailable =
        [srcTokenizedModel, tgtTokenizedModel].find(
            (m) => m && selectedModel && m !== selectedModel,
        ) ?? null;

    // Predicted next-token from the last lens run. Hidden when the prompt
    // currently in the textarea no longer matches what the lens was run on.
    const srcPrediction = useMemo(() => {
        if (!lensResult?.source) return null;
        if (lastRunSrcPrompt == null || sourcePrompt !== lastRunSrcPrompt) return null;
        return finalPrediction(lensResult.source);
    }, [lensResult, sourcePrompt, lastRunSrcPrompt]);

    const tgtPrediction = useMemo(() => {
        if (!lensResult?.target) return null;
        if (lastRunTgtPrompt == null || targetPrompt !== lastRunTgtPrompt) return null;
        return finalPrediction(lensResult.target);
    }, [lensResult, targetPrompt, lastRunTgtPrompt]);

    const { mutateAsync: runLogitLens, isPending: isRunning } = usePatchLensLogitLens();

    // Target is optional: when blank, Patch Lens runs in single-prompt mode and
    // only computes the source lens. The widget hides the target heatmap and
    // disables drag-and-drop patching in that mode.
    const canRun = !!selectedModel && !!sourcePrompt.trim() && !isRunning;

    const handleRun = useCallback(async () => {
        if (!selectedModel) {
            toast.error("Please select a model.");
            return;
        }
        if (!sourcePrompt.trim()) {
            toast.error("Please enter a source prompt.");
            return;
        }
        // Trim surrounding whitespace: a trailing space tokenizes as its own
        // token and collapses the model's prediction onto whitespace/digits.
        const src = sourcePrompt.trim();
        const tgt = targetPrompt.trim();
        // Reflect the trimmed text back into the editors so the textbox matches
        // what was actually run (and the heatmap): otherwise sourcePrompt still
        // holds the trailing space while lastRun snapshots the trimmed prompt,
        // and the prompt-vs-heatmap mismatch hides the prediction hint.
        if (src !== sourcePrompt) onSourcePromptChange(src);
        if (tgt !== targetPrompt) onTargetPromptChange(tgt);

        if (!chartId) {
            toast.error("Missing chart id.");
            return;
        }

        capture("run_submitted", {
            tool: "patch-lens",
            model: selectedModel,
            source_prompt_length: src.length,
            target_prompt_length: tgt.length,
        });

        try {
            const result = await runLogitLens({
                sourcePrompt: src,
                targetPrompt: tgt, // empty/whitespace is fine — mutation skips the call
                model: selectedModel,
                chartId,
                workspaceId,
            });
            onLensResult?.(result, src, tgt);
            toast.success(
                tgt.trim() ? "Logit lens computed for both prompts." : "Logit lens computed.",
            );
        } catch (error) {
            // Error toast handled by the mutation's onError.
            capture("run_failed", { tool: "patch-lens", error: String(error) });
        }
    }, [
        selectedModel,
        sourcePrompt,
        targetPrompt,
        onSourcePromptChange,
        onTargetPromptChange,
        runLogitLens,
        onLensResult,
        chartId,
        workspaceId,
        capture,
    ]);

    const { startTutorial } = useTutorialAutoStart();

    return (
        <div className="h-full flex flex-col md:min-w-64">
            <div id="patch-lens-welcome" className="p-3 border-b flex items-center justify-between">
                <h2 className="text-sm pl-2 font-medium">Patch Lens</h2>
                <div className="flex items-center gap-2">
                    {configModelUnavailable && (
                        <Tooltip>
                            <TooltipTrigger>
                                <AlertCircle className="w-4 h-4 text-yellow-500" />
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                                <p>
                                    Tokens last computed with &quot;{configModelUnavailable}&quot;.
                                    Click a prompt and blur to retokenize.
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={startTutorial}
                    >
                        Tutorial
                    </Button>
                </div>
            </div>

            <div className="p-3 flex-1 overflow-auto flex flex-col gap-4">
                <div id="patch-lens-source-prompt" className="flex flex-col gap-1.5 relative">
                    {sourcePrompt && (
                        <button
                            type="button"
                            onClick={handleClearSrc}
                            disabled={isRunning}
                            className="absolute top-0 right-0 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 flex items-center gap-0.5 h-5 px-1"
                            title="Clear source prompt"
                        >
                            <X className="h-3 w-3" />
                            <span>Clear</span>
                        </button>
                    )}
                    <PatchPromptSection
                        variant="source"
                        mode="full"
                        label="Source Prompt"
                        prompt={sourcePrompt}
                        setPrompt={onSourcePromptChange}
                        tokens={srcTokens}
                        selectedModel={selectedModel ?? ""}
                        isEditing={srcEditing}
                        setIsEditing={setSrcEditing}
                        tokenizedModel={srcTokenizedModel}
                        textareaRef={srcTextareaRef}
                        tokenContainerRef={srcTokenContainerRef}
                        onBlur={handleSrcBlur}
                        selectedPositions={[]}
                        pendingRangeStart={null}
                        onSrcTokenClick={() => {}}
                        predictionToken={srcPrediction}
                    />
                    <p className="text-xs text-muted-foreground leading-snug">
                        The prompt you want to <span className="font-medium">steal state from</span>
                        . Pick something with a clear, specific prediction — its internal
                        activations will be the source of the patch.
                    </p>
                </div>

                <div id="patch-lens-target-prompt" className="flex flex-col gap-1.5 relative">
                    {targetPrompt && (
                        <button
                            type="button"
                            onClick={handleClearTgt}
                            disabled={isRunning}
                            className="absolute top-0 right-0 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 flex items-center gap-0.5 h-5 px-1"
                            title="Clear target prompt"
                        >
                            <X className="h-3 w-3" />
                            <span>Clear</span>
                        </button>
                    )}
                    <PatchPromptSection
                        variant="target"
                        mode="full"
                        label="Target Prompt"
                        prompt={targetPrompt}
                        setPrompt={onTargetPromptChange}
                        tokens={tgtTokens}
                        selectedModel={selectedModel ?? ""}
                        isEditing={tgtEditing}
                        setIsEditing={setTgtEditing}
                        tokenizedModel={tgtTokenizedModel}
                        textareaRef={tgtTextareaRef}
                        tokenContainerRef={tgtTokenContainerRef}
                        onBlur={handleTgtBlur}
                        tgtSelectedPositions={[]}
                        frozenPositions={[]}
                        onTgtTokenClick={() => {}}
                        predictionToken={tgtPrediction}
                    />
                    <p className="text-xs text-muted-foreground leading-snug">
                        The prompt you want to <span className="font-medium">patch into</span>.
                        Usually similar grammar but a different answer — any change in its
                        prediction after a patch reveals what the source state carried. Leave blank
                        to view the source prompt alone (no patching).
                    </p>
                </div>

                <Button
                    id="patch-lens-run"
                    onClick={handleRun}
                    disabled={!canRun}
                    className="w-full"
                >
                    {isRunning ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Computing...
                        </>
                    ) : (
                        <>
                            <Play className="mr-2 h-4 w-4" />
                            Run Patch Lens
                        </>
                    )}
                </Button>

                {onSelectRun && <LensHistoryRail onSelectRun={onSelectRun} />}
            </div>
        </div>
    );
}
