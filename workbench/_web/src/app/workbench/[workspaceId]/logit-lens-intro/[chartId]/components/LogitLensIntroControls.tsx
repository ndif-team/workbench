"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Play, TriangleAlert } from "lucide-react";
import { useLogitLensIntro } from "@/lib/api/logitLensIntroApi";
import { useUpdateChartConfig } from "@/lib/api/configApi";
import { LogitLensIntroConfigData } from "@/types/logitLensIntro";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { encodeText } from "@/actions/tok";
import { TokenizerLoadError } from "@/actions/errors";
import { Token } from "@/types/models";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

interface LogitLensIntroConfig {
    id: string;
    data: LogitLensIntroConfigData;
    type: string;
}

interface LogitLensIntroControlsProps {
    initialConfig: LogitLensIntroConfig;
    selectedModel: string;
}

const TOKEN_STYLES = {
    base: "!text-sm !leading-5 whitespace-pre-wrap break-words select-none !box-border relative",
    hover: "hover:bg-primary/20 hover:ring-1 hover:ring-primary/30 hover:ring-inset",
} as const;

const fixTokenText = (text: string) => {
    const numNewlines = (text.match(/\n/g) || []).length;
    const result = text
        .replace(/\r\n/g, "\\r\\n")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
    return { result, numNewlines };
};

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

export function LogitLensIntroControls({ initialConfig, selectedModel }: LogitLensIntroControlsProps) {
    const { workspaceId, chartId } = useParams<{ workspaceId: string; chartId: string }>();

    const [prompt, setPrompt] = useState(initialConfig.data?.prompt || "");
    const [topk, setTopk] = useState(initialConfig.data?.topk ?? 5);
    const [includeEntropy, setIncludeEntropy] = useState(
        initialConfig.data?.includeEntropy ?? true,
    );

    const [tokenData, setTokenData] = useState<Token[]>([]);
    const [editingText, setEditingText] = useState(true);
    const [tokenizedModel, setTokenizedModel] = useState<string | null>(null);

    const lastSyncedPromptRef = useRef<string>(initialConfig.data?.prompt || "");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const tokenContainerRef = useRef<HTMLDivElement>(null);

    const { mutateAsync: computeLens, isPending: isComputing } = useLogitLensIntro();
    const { mutateAsync: updateConfig, isPending: isUpdatingConfig } = useUpdateChartConfig();

    const isExecuting = isComputing || isUpdatingConfig;

    useEffect(() => {
        const configPrompt = initialConfig.data?.prompt || "";
        if (configPrompt && configPrompt !== lastSyncedPromptRef.current) {
            setPrompt(configPrompt);
            lastSyncedPromptRef.current = configPrompt;
        }
    }, [initialConfig.data?.prompt]);

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

    const autoResizeTextarea = useCallback(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, []);

    useEffect(() => {
        if (editingText) autoResizeTextarea();
    }, [prompt, editingText, autoResizeTextarea]);

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

    const handleSubmit = useCallback(async () => {
        const trimmedPrompt = prompt.trim();
        if (!trimmedPrompt) return;

        let tokens: Token[];
        try {
            tokens = await encodeText(trimmedPrompt, selectedModel);
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

        const config: LogitLensIntroConfigData = {
            model: selectedModel,
            prompt: trimmedPrompt,
            topk,
            includeEntropy,
        };

        await computeLens({
            lensRequest: {
                completion: config,
                chartId,
            },
            configId: initialConfig.id,
        });

        await updateConfig({
            configId: initialConfig.id,
            config: {
                data: config,
                workspaceId,
                type: "logit-lens-intro",
            },
        });

        lastSyncedPromptRef.current = trimmedPrompt;
        setEditingText(false);
    }, [
        prompt,
        topk,
        includeEntropy,
        selectedModel,
        chartId,
        initialConfig.id,
        workspaceId,
        computeLens,
        updateConfig,
    ]);

    const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setPrompt(e.target.value);
    }, []);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
            }
        },
        [handleSubmit],
    );

    const handleTextareaBlur = useCallback(() => {
        setTimeout(() => {
            const activeElement = document.activeElement;
            const withinTextarea = activeElement && textareaRef.current?.contains(activeElement);
            const withinToken = activeElement && tokenContainerRef.current?.contains(activeElement);
            const popoverOpen = document.querySelector("[data-radix-popper-content-wrapper]");

            if (withinTextarea || withinToken || popoverOpen) return;

            if (prompt.trim()) {
                handleTokenize();
            }
        }, 100);
    }, [prompt, handleTokenize]);

    const modelMismatch =
        tokenizedModel && tokenizedModel !== selectedModel && tokenData.length > 0;

    return (
        <div className="flex flex-col gap-4">
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

            <p className="text-xs text-muted-foreground text-center">
                <kbd className="px-1 py-0.5 bg-muted rounded text-xs">⌘</kbd> +{" "}
                <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Enter</kbd> to run
            </p>
        </div>
    );
}
