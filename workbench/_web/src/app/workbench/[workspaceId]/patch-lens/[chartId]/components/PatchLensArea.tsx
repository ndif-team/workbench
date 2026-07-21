"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { useCapture } from "@/lib/analytics";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2, Play, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTour } from "@reactour/tour";
import { PatchLensTutorial } from "@/tutorials/patchLens";
import { usePatchLensTutorial, hydratePatchLensTutorial } from "@/stores/usePatchLensTutorial";
import { useTutorialEmit } from "@/components/providers/TutorialEventProvider";
import { useProlificTutorial } from "@/stores/useProlificTutorial";
import { useSpotlight } from "edulogitlens";
import { TutorialActivityPanel } from "./tutorial/TutorialActivityPanel";
import { getModels } from "@/lib/api/modelsApi";
import { useWorkspaceWorkshop } from "@/lib/api/workshopApi";
import { useWorkspaceTutorial } from "@/lib/api/tutorialContentApi";
import { useWorkspace } from "@/stores/useWorkspace";
import { encodeText } from "@/actions/tok";
import { TokenizerLoadError } from "@/actions/errors";
import { Token } from "@/types/models";
import { PatchPromptSection } from "@/components/activation-patching/toolkit";
import { toast } from "sonner";
import { usePatchLensLogitLens, PatchLensResult } from "@/lib/api/patchLensApi";
import { finalPrediction, finalTopKTokens } from "@/lib/lens-last-row";
import { promptPhrasingWarning } from "@/lib/promptPhrasing";
import type { NormalizedRun } from "@/lib/lensRun";
import { LensHistoryRail } from "./LensHistoryRail";

// Default model for the CM intro. 32 layers reads as a manageable heatmap;
// index 0 in the model list is the 70B (80 layers), far too many for a primer.
const DEFAULT_INTRO_MODEL = "meta-llama/Llama-3.1-8B";

// A known-good source prompt for the tutorial / first-time users. On the
// default intro model it produces a clear "Paris" prediction, so the lens
// heatmap reads well. Source only — the "Reading the lens" chapter wants the
// target left blank, and the patching chapter walks the user through adding it.
const EXAMPLE_SOURCE = "The Eiffel Tower is in the city of";

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

function useTutorialAutoStart({ disabled }: { disabled: boolean }) {
    const { setSteps, setIsOpen, setCurrentStep, isOpen } = useTour();
    const { completed, markCompleted } = usePatchLensTutorial();
    // Auto-start fires at most once per mount; dismissing then resaving the
    // localStorage flag prevents a popup loop (same pattern as lens-intro).
    const autoStartedRef = useRef(false);

    useEffect(() => {
        hydratePatchLensTutorial();
    }, []);

    useEffect(() => {
        // In workshop mode we auto-launch the DB-configured guided tutorial
        // instead of this hard-coded reactour walkthrough, so stay closed.
        if (disabled || autoStartedRef.current || completed || isOpen) return;
        if (!setSteps || !setIsOpen) return;
        autoStartedRef.current = true;
        const steps = PatchLensTutorial.chapters[0]?.steps ?? [];
        setSteps(steps);
        // reactour keeps currentStep at the provider level, so reset to the
        // start explicitly rather than relying on the (already-0) default.
        setCurrentStep(0);
        const id = setTimeout(() => {
            setIsOpen(true);
            markCompleted();
        }, 600);
        return () => clearTimeout(id);
    }, [disabled, completed, isOpen, setSteps, setIsOpen, setCurrentStep, markCompleted]);

    const startTutorial = (chapterIdx: number = 0) => {
        if (!setSteps || !setIsOpen) return;
        const steps = PatchLensTutorial.chapters[chapterIdx]?.steps ?? [];
        setSteps(steps);
        // Always restart from step 1. reactour retains the last step index across
        // opens, so without this a reopen (e.g. after clicking Done on the last
        // step) resumes at the end instead of the beginning.
        setCurrentStep(0);
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
    const { emit: emitTutorialEvent } = useTutorialEmit();
    const prolificTutorial = useProlificTutorial();
    const { setTarget: setSpotlight } = useSpotlight();
    const { selectedModelIdx, setSelectedModelIdx } = useWorkspace();

    // Bind the guided-tutorial store to this workspace (resets on workspace change).
    useEffect(() => {
        if (workspaceId) prolificTutorial.setWorkspace(workspaceId);
        // setWorkspace is stable-by-value; only re-bind when the workspace changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspaceId]);

    // Tutorial content is DB-backed (workshop's assigned tutorial, else the demo
    // seed). Inject the resolved units into the store so the panel can render them.
    const { data: tutorialContent } = useWorkspaceTutorial(workspaceId as string);
    useEffect(() => {
        if (tutorialContent) prolificTutorial.setUnits(tutorialContent.units);
        // setUnits is stable-by-value; only re-inject when the content changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tutorialContent]);

    // Top-1 / top-2 next tokens from the last run, captured atomically with a
    // nonce so the guided-tutorial panel scores each run exactly once (§4.7).
    const [runTokens, setRunTokens] = useState<{
        nonce: number;
        top: string | null;
        second: string | null;
    }>({ nonce: 0, top: null, second: null });

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

    // Workshop mode auto-launches the configured guided tutorial once its content
    // has loaded — participants shouldn't have to hunt for the Tutorial menu.
    // Fires once per mount; resumes rather than restarts a participant who
    // already has progress (or exited deliberately), reading fresh store state to
    // avoid a stale closure. `setUnits` (above) has already run for this content.
    const guidedAutoStartedRef = useRef(false);
    useEffect(() => {
        if (guidedAutoStartedRef.current) return;
        if (!workshop || !tutorialContent) return;
        guidedAutoStartedRef.current = true;
        const st = useProlificTutorial.getState();
        if (!st.active && st.completedUnits.length === 0 && st.unitIdx === 0) {
            st.start();
        }
    }, [workshop, tutorialContent]);

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

    // Load a known-good example into the source prompt so first-time users (and
    // the tutorial) have something that works to follow along with. Source only:
    // the lens chapter wants the target blank. Focusing after the fill lets the
    // blur-driven tokenization show the token chips.
    const handleTryExample = useCallback(() => {
        onSourcePromptChange(EXAMPLE_SOURCE);
        setSrcEditing(true);
        setTimeout(() => srcTextareaRef.current?.focus(), 0);
    }, [onSourcePromptChange]);

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

    // Soft phrasing guardrail (spec §4.2): when the source prompt's top predicted
    // token is punctuation/newline/EOS, the model thinks the text is complete —
    // nudge the user to rephrase so the answer comes next. Non-blocking.
    const phrasingWarning = useMemo(() => promptPhrasingWarning(srcPrediction), [srcPrediction]);

    const { mutateAsync: runLogitLens, isPending: isRunning } = usePatchLensLogitLens();

    // Target is optional: when blank, Patch Lens runs in single-prompt mode and
    // only computes the source lens. The widget hides the target heatmap and
    // disables drag-and-drop patching in that mode.
    const canRun = !!selectedModel && !!sourcePrompt.trim() && !isRunning;

    // Core run: computes the lens for explicit prompts. handleRun wraps it with
    // the current editor state; the tutorial's "Try a prompt" path calls it with
    // the inserted prompt directly (React state updates aren't visible in the
    // same tick, so we can't rely on sourcePrompt having updated).
    const executeRun = useCallback(
        async (srcRaw: string, tgtRaw: string) => {
            if (!selectedModel) {
                toast.error("Please select a model.");
                return;
            }
            if (!srcRaw.trim()) {
                toast.error("Please enter a source prompt.");
                return;
            }
            // Trim surrounding whitespace: a trailing space tokenizes as its own
            // token and collapses the model's prediction onto whitespace/digits.
            const src = srcRaw.trim();
            const tgt = tgtRaw.trim();
            // Reflect the trimmed text back into the editors so the textbox matches
            // what was actually run (and the heatmap): otherwise the editor still
            // holds the trailing space while lastRun snapshots the trimmed prompt,
            // and the prompt-vs-heatmap mismatch hides the prediction hint.
            if (src !== srcRaw) onSourcePromptChange(src);
            if (tgt !== tgtRaw) onTargetPromptChange(tgt);

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

            // Advance any tutorial step gated on clicking Run (the click trigger was
            // dead until the event bus was wired — see TutorialEventProvider).
            emitTutorialEvent({ type: "click", target: "#patch-lens-run" });

            try {
                const result = await runLogitLens({
                    sourcePrompt: src,
                    targetPrompt: tgt, // empty/whitespace is fine — mutation skips the call
                    model: selectedModel,
                    chartId,
                    workspaceId,
                });
                onLensResult?.(result, src, tgt);
                // Advance runCompleted-gated steps; the predicate (if any) inspects
                // this result (e.g. unit 3's "top prediction ≠ 10").
                emitTutorialEvent({ type: "runCompleted", result });
                // Capture the run's top tokens atomically for the guided-tutorial
                // panel (success predicate + embedded check auto-scoring).
                setRunTokens((prev) => ({
                    nonce: prev.nonce + 1,
                    top: finalPrediction(result.source),
                    second: finalTopKTokens(result.source, 2)[1] ?? null,
                }));
                toast.success(
                    tgt.trim() ? "Logit lens computed for both prompts." : "Logit lens computed.",
                );
            } catch (error) {
                // Error toast handled by the mutation's onError.
                capture("run_failed", { tool: "patch-lens", error: String(error) });
            }
        },
        [
            selectedModel,
            onSourcePromptChange,
            onTargetPromptChange,
            runLogitLens,
            onLensResult,
            chartId,
            workspaceId,
            capture,
            emitTutorialEvent,
        ],
    );

    const handleRun = useCallback(
        () => executeRun(sourcePrompt, targetPrompt),
        [executeRun, sourcePrompt, targetPrompt],
    );

    // Tutorial "Try a prompt": fill the source prompt, show its tokenized chips,
    // then run — one click instead of insert-then-Run. Target is left as-is
    // (empty in lens units → single-prompt mode).
    const handleTryPrompt = useCallback(
        async (text: string) => {
            const trimmed = text.trim();
            onSourcePromptChange(trimmed);
            if (selectedModel && trimmed) {
                const tokens = await tokenize(trimmed, selectedModel);
                if (tokens && tokens.length > 0) {
                    setSrcTokens(tokens);
                    setSrcTokenizedModel(selectedModel);
                    setSrcEditing(false);
                }
            }
            await executeRun(trimmed, targetPrompt);
        },
        [selectedModel, tokenize, onSourcePromptChange, targetPrompt, executeRun],
    );

    // Suppress the hard-coded reactour walkthrough in workshop mode (and while
    // the workshop lookup is pending) — the guided tutorial auto-launches there.
    const { startTutorial } = useTutorialAutoStart({ disabled: workshopLoading || !!workshop });

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
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className={`h-7 px-2 text-xs ${
                                    prolificTutorial.active
                                        ? "text-primary ring-2 ring-primary/50 ring-offset-1 ring-offset-background"
                                        : "text-muted-foreground"
                                }`}
                            >
                                Tutorial
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => prolificTutorial.start()}>
                                Guided tutorial
                                {tutorialContent ? ` (${tutorialContent.units.length} steps)` : ""}
                            </DropdownMenuItem>
                            {PatchLensTutorial.chapters.map((chapter, idx) => (
                                <DropdownMenuItem
                                    key={chapter.title}
                                    onSelect={() => startTutorial(idx)}
                                >
                                    {chapter.title}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <div className="p-3 flex-1 overflow-auto flex flex-col gap-4">
                <div id="patch-lens-source-prompt" className="flex flex-col gap-1.5 relative">
                    {sourcePrompt ? (
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
                    ) : (
                        <button
                            type="button"
                            onClick={handleTryExample}
                            disabled={isRunning}
                            className="absolute top-0 right-0 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 h-5 px-1"
                            title={`Load an example prompt: "${EXAMPLE_SOURCE}"`}
                        >
                            Try an example
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

                {phrasingWarning && (
                    <p
                        role="status"
                        className="flex items-start gap-1.5 text-xs text-yellow-600 dark:text-yellow-500 leading-snug"
                    >
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>{phrasingWarning}</span>
                    </p>
                )}

                <TutorialActivityPanel
                    runNonce={runTokens.nonce}
                    topToken={runTokens.top}
                    secondToken={runTokens.second}
                    surveyUrl={workshop?.surveyUrl}
                    completionThanks={workshop?.completionText}
                    workshopMode={!!workshop}
                    onSpotlight={setSpotlight}
                    onTryPrompt={handleTryPrompt}
                    onInsertPrompt={(text) => {
                        onSourcePromptChange(text);
                        setSrcEditing(true);
                        setTimeout(() => srcTextareaRef.current?.focus(), 0);
                    }}
                    onInsertPatchPair={({ source, target }) => {
                        onSourcePromptChange(source);
                        onTargetPromptChange(target);
                        setSrcEditing(true);
                        setTgtEditing(true);
                    }}
                />

                {onSelectRun && <LensHistoryRail onSelectRun={onSelectRun} />}
            </div>
        </div>
    );
}
