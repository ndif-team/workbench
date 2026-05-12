"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Play, TriangleAlert } from "lucide-react";
import { useLens2 } from "@/lib/api/lensApi";
import { useUpdateChartConfig } from "@/lib/api/configApi";
import { Lens2ConfigData } from "@/types/lens2";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { encodeText } from "@/actions/tok";
import { TokenizerLoadError } from "@/actions/errors";
import { Token } from "@/types/models";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

interface Lens2Config {
    id: string;
    data: Lens2ConfigData;
    type: string;
}

interface Lens2ControlsProps {
    initialConfig: Lens2Config;
    selectedModel: string;
    hasExistingData?: boolean;
}

// Token styling constants (matching the original lens)
const TOKEN_STYLES = {
    base: "!text-sm !leading-5 whitespace-pre-wrap break-words select-none !box-border relative",
    hover: "hover:bg-primary/20 hover:ring-1 hover:ring-primary/30 hover:ring-inset",
} as const;

// Helper to fix newlines for display
const fixTokenText = (text: string) => {
    const numNewlines = (text.match(/\n/g) || []).length;
    const result = text
        .replace(/\r\n/g, "\\r\\n")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
    return { result, numNewlines };
};

// Simple TokenDisplay component for lens2 (no selection needed)
function TokenDisplay({ tokens, loading }: { tokens: Token[]; loading: boolean }) {
    return (
        <div className="w-full custom-scrollbar select-none whitespace-pre-wrap break-words">
            {tokens.map((token, idx) => {
                const { result, numNewlines } = fixTokenText(token.text);
                return (
                    <span key={`token-${idx}`}>
                        <span
                            data-token-id={idx}
                            className={cn(
                                TOKEN_STYLES.base,
                                "bg-transparent",
                                !loading && TOKEN_STYLES.hover,
                                token.text === "\\n" ? "w-full" : "w-fit",
                                loading ? "cursor-progress" : "cursor-default",
                            )}
                        >
                            {result}
                        </span>
                        {numNewlines > 0 && "\n".repeat(numNewlines)}
                    </span>
                );
            })}
        </div>
    );
}

export function Lens2Controls({
    initialConfig,
    selectedModel,
    hasExistingData = false,
}: Lens2ControlsProps) {
    const { workspaceId, chartId } = useParams<{ workspaceId: string; chartId: string }>();

    // Local state for the form
    const initialPrompt = initialConfig.data?.prompt || "";
    const initialTopk = initialConfig.data?.topk ?? 5;
    const initialIncludeEntropy = initialConfig.data?.includeEntropy ?? true;

    const [prompt, setPrompt] = useState(initialPrompt);
    const [topk, setTopk] = useState(initialTopk);
    const [includeEntropy, setIncludeEntropy] = useState(initialIncludeEntropy);

    // Auto-run flags - check if we should auto-run on mount (coming from landing page)
    // Only auto-run if a prompt is pre-filled and there's no existing chart data
    const shouldAutoRunRef = useRef(initialPrompt.trim().length > 0 && !hasExistingData);
    const hasAutoRunRef = useRef(false);

    // Token state
    const [tokenData, setTokenData] = useState<Token[]>([]);
    const [editingText, setEditingText] = useState(true);
    const [tokenizedModel, setTokenizedModel] = useState<string | null>(null);

    // Track the last prompt we successfully submitted/tokenized
    const lastSyncedPromptRef = useRef<string>(initialConfig.data?.prompt || "");

    // Refs
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const tokenContainerRef = useRef<HTMLDivElement>(null);

    // Mutations
    const { mutateAsync: computeLens2, isPending: isComputing } = useLens2();
    const { mutateAsync: updateConfig, isPending: isUpdatingConfig } = useUpdateChartConfig();

    const isExecuting = isComputing || isUpdatingConfig;

    // Sync prompt when config changes - but only if it's a genuinely new value from the server
    // (not our own update being echoed back)
    useEffect(() => {
        const configPrompt = initialConfig.data?.prompt || "";
        // Only sync if the config prompt differs from what we last synced
        // This prevents overwriting local edits when our own mutation is echoed back
        if (configPrompt && configPrompt !== lastSyncedPromptRef.current) {
            setPrompt(configPrompt);
            lastSyncedPromptRef.current = configPrompt;
        }
    }, [initialConfig.data?.prompt]);

    // Tokenize when we have existing data on initial load
    useEffect(() => {
        const fetchTokens = async () => {
            if (initialConfig.data?.prompt && selectedModel) {
                const tokens = await encodeText(initialConfig.data.prompt, selectedModel);
                if (tokens.length > 0) {
                    setTokenData(tokens);
                    setTokenizedModel(selectedModel);
                    setEditingText(false);
                }
            }
        };
        fetchTokens();
    }, [initialConfig.id, selectedModel]);

    // Auto-run effect for when coming from landing page.
    // isExecuting is intentionally NOT in deps — hasAutoRunRef already guards against
    // re-firing, and adding isExecuting would schedule a redundant timer each time
    // the mutation state flips.
    useEffect(() => {
        let isCancelled = false;

        const autoRunLens2 = async () => {
            if (
                !shouldAutoRunRef.current ||
                hasAutoRunRef.current ||
                !selectedModel ||
                selectedModel.length === 0
            ) {
                return;
            }

            hasAutoRunRef.current = true;
            shouldAutoRunRef.current = false;

            try {
                const tokens = await encodeText(initialPrompt, selectedModel);
                if (isCancelled || tokens.length <= 1) return;

                setTokenData(tokens);
                setTokenizedModel(selectedModel);
                setEditingText(false);

                const config: Lens2ConfigData = {
                    model: selectedModel,
                    prompt: initialPrompt,
                    topk: initialTopk,
                    includeEntropy: initialIncludeEntropy,
                };

                await computeLens2({
                    lensRequest: {
                        completion: config,
                        chartId,
                    },
                    configId: initialConfig.id,
                });
                if (isCancelled) return;

                await updateConfig({
                    configId: initialConfig.id,
                    chartId,
                    config: {
                        data: config,
                        workspaceId,
                        type: "lens2",
                    },
                });
                if (isCancelled) return;

                lastSyncedPromptRef.current = initialPrompt;
            } catch (error) {
                // Don't reset flags - we only try once
            }
        };

        // Small delay to ensure all dependencies are ready
        const timer = setTimeout(autoRunLens2, 800);
        return () => {
            isCancelled = true;
            clearTimeout(timer);
        };
    }, [
        selectedModel,
        initialPrompt,
        initialTopk,
        initialIncludeEntropy,
        chartId,
        initialConfig.id,
        workspaceId,
        computeLens2,
        updateConfig,
    ]);

    // Auto-resize the textarea to fit its content
    const autoResizeTextarea = useCallback(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, []);

    useEffect(() => {
        if (editingText) autoResizeTextarea();
    }, [prompt, editingText, autoResizeTextarea]);

    // Handle switching from token view to edit view
    const escapeTokenArea = useCallback(() => {
        setEditingText(true);
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                const length = textareaRef.current.value.length;
                textareaRef.current.setSelectionRange(length, length);
            }
        }, 0);
    }, []);

    // Tokenize the prompt
    const handleTokenize = useCallback(async () => {
        if (!prompt.trim()) {
            toast.error("Please enter a prompt.");
            return;
        }

        let tokens: Token[];
        try {
            tokens = await encodeText(prompt, selectedModel);
        } catch (error) {
            if (error instanceof TokenizerLoadError) {
                toast.error(
                    `Could not load tokenizer for ${selectedModel}. The model may be gated and require authentication.`,
                );
            } else {
                toast.error("Failed to tokenize prompt.");
            }
            return;
        }
        if (tokens.length <= 1) {
            toast.error("Please enter a longer prompt.");
            return;
        }

        setTokenData(tokens);
        setTokenizedModel(selectedModel);
        setEditingText(false);
    }, [prompt, selectedModel]);

    // Handle form submission (tokenize + run)
    const handleSubmit = useCallback(async () => {
        if (!prompt.trim()) return;

        // Always tokenize with the current prompt to ensure tokens are in sync
        let tokens: Token[];
        try {
            tokens = await encodeText(prompt, selectedModel);
        } catch (error) {
            if (error instanceof TokenizerLoadError) {
                toast.error(
                    `Could not load tokenizer for ${selectedModel}. The model may be gated and require authentication.`,
                );
            } else {
                toast.error("Failed to tokenize prompt.");
            }
            return;
        }
        if (tokens.length <= 1) {
            toast.error("Please enter a longer prompt.");
            return;
        }
        setTokenData(tokens);
        setTokenizedModel(selectedModel);

        const config: Lens2ConfigData = {
            model: selectedModel,
            prompt,
            topk,
            includeEntropy,
        };

        // Compute the lens2 visualization
        await computeLens2({
            lensRequest: {
                completion: config,
                chartId,
            },
            configId: initialConfig.id,
        });

        // Update the config in the database
        await updateConfig({
            configId: initialConfig.id,
            chartId,
            config: {
                data: config,
                workspaceId,
                type: "lens2",
            },
        });

        // Update our sync ref so the useEffect doesn't overwrite our prompt
        lastSyncedPromptRef.current = prompt;
        setEditingText(false);
    }, [
        prompt,
        topk,
        includeEntropy,
        selectedModel,
        chartId,
        initialConfig.id,
        workspaceId,
        computeLens2,
        updateConfig,
    ]);

    // Handle prompt change
    const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setPrompt(e.target.value);
    }, []);

    // Handle keyboard shortcuts
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            // Cmd/Ctrl + Enter to run
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
            }
        },
        [handleSubmit],
    );

    // Handle textarea blur - automatically tokenize when user clicks away
    const handleTextareaBlur = useCallback(() => {
        setTimeout(() => {
            const activeElement = document.activeElement;
            const withinTextarea = activeElement && textareaRef.current?.contains(activeElement);
            const withinToken = activeElement && tokenContainerRef.current?.contains(activeElement);
            const popoverOpen = document.querySelector("[data-radix-popper-content-wrapper]");

            // Don't tokenize if still focused in the prompt area or a popover is open
            if (withinTextarea || withinToken || popoverOpen) return;

            // Auto-tokenize if there's a prompt
            if (prompt.trim()) {
                handleTokenize();
            }
        }, 100);
    }, [prompt, handleTokenize]);

    // Check if tokenization is out of sync with selected model
    const modelMismatch =
        tokenizedModel && tokenizedModel !== selectedModel && tokenData.length > 0;

    return (
        <div className="flex flex-col gap-4">
            {/* Prompt Input / Token Display */}
            <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">Prompt</Label>
                <div className="relative">
                    {editingText ? (
                        <Textarea
                            ref={textareaRef}
                            value={prompt}
                            onChange={(e) => {
                                handlePromptChange(e);
                                autoResizeTextarea();
                            }}
                            onKeyDown={handleKeyDown}
                            onBlur={handleTextareaBlur}
                            className="w-full !text-sm bg-input/30 min-h-32 !leading-5"
                            placeholder="Enter your prompt here..."
                            disabled={isExecuting}
                        />
                    ) : (
                        <div
                            ref={tokenContainerRef}
                            className={cn(
                                "flex w-full px-3 py-2 bg-input/30 border rounded min-h-32",
                                isExecuting ? "cursor-progress" : "cursor-text",
                            )}
                            onClick={() => {
                                if (!isExecuting) escapeTokenArea();
                            }}
                        >
                            <TokenDisplay tokens={tokenData} loading={isExecuting} />
                        </div>
                    )}

                    {/* Model mismatch warning */}
                    {modelMismatch && !isExecuting && !editingText && (
                        <Tooltip>
                            <TooltipTrigger className="absolute bottom-2 right-2">
                                <TriangleAlert className="w-4 h-4 text-destructive/70" />
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                                <p className="w-36 text-wrap text-center">
                                    Tokenization does not match the selected model. Please
                                    retokenize.
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
            </div>

            {/* Top-K Slider */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <Label htmlFor="topk" className="text-sm font-medium">
                        Top-K Predictions
                    </Label>
                    <span className="text-sm text-muted-foreground">{topk}</span>
                </div>
                <Slider
                    id="topk"
                    min={1}
                    max={10}
                    step={1}
                    value={[topk]}
                    onValueChange={([value]) => setTopk(value)}
                    disabled={isExecuting}
                    className="w-full"
                />
            </div>

            {/* Include Entropy Toggle */}
            <div className="flex items-center gap-2">
                <Checkbox
                    id="entropy"
                    checked={includeEntropy}
                    onCheckedChange={(checked) => setIncludeEntropy(checked === true)}
                    disabled={isExecuting}
                />
                <Label htmlFor="entropy" className="text-sm font-medium cursor-pointer">
                    Include Entropy
                </Label>
            </div>

            {/* Run Button */}
            <Button
                onClick={handleSubmit}
                disabled={isExecuting || !prompt.trim()}
                className="w-full"
            >
                {isExecuting ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Computing...
                    </>
                ) : (
                    <>
                        <Play className="mr-2 h-4 w-4" />
                        Run Logit Lens
                    </>
                )}
            </Button>

            {/* Keyboard shortcut hint */}
            <p className="text-xs text-muted-foreground text-center">
                <kbd className="px-1 py-0.5 bg-muted rounded text-xs">⌘</kbd> +{" "}
                <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Enter</kbd> to run
            </p>
        </div>
    );
}
