"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Play, TriangleAlert, MousePointerClick } from "lucide-react";
import { useActivationPatching } from "@/lib/api/activationPatchingApi";
import { useUpdateChartConfig } from "@/lib/api/configApi";
import { ActivationPatchingConfigData } from "@/types/activationPatching";
import { encodeText } from "@/actions/tok";
import { Token } from "@/types/models";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

interface ActivationPatchingConfig {
    id: string;
    data: ActivationPatchingConfigData;
    type: string;
}

interface ActivationPatchingControlsProps {
    initialConfig: ActivationPatchingConfig;
    selectedModel: string;
}

// Token styling constants
const TOKEN_STYLES = {
    base: "!text-sm !leading-5 whitespace-pre-wrap break-words select-none !box-border relative px-0.5 py-0.5 rounded-sm transition-all",
    hover: "hover:bg-primary/20 hover:ring-1 hover:ring-primary/30 hover:ring-inset cursor-pointer",
    selected: "bg-primary/40 ring-2 ring-primary ring-inset",
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

// Token display with click-to-select functionality
function SelectableTokenDisplay({
    tokens,
    loading,
    selectedPos,
    onTokenClick,
    label,
}: {
    tokens: Token[];
    loading: boolean;
    selectedPos: number | null;
    onTokenClick: (pos: number) => void;
    label: string;
}) {
    return (
        <div className="w-full custom-scrollbar select-none whitespace-pre-wrap break-words">
            {tokens.length === 0 ? (
                <span className="text-muted-foreground text-sm italic">
                    Enter text and click away to tokenize
                </span>
            ) : (
                tokens.map((token, idx) => {
                    const { result, numNewlines } = fixTokenText(token.text);
                    const isSelected = selectedPos === idx;
                    return (
                        <span key={`token-${idx}`}>
                            <span
                                data-token-id={idx}
                                onClick={() => !loading && onTokenClick(idx)}
                                className={cn(
                                    TOKEN_STYLES.base,
                                    "bg-transparent",
                                    !loading && TOKEN_STYLES.hover,
                                    isSelected && TOKEN_STYLES.selected,
                                    token.text === "\\n" ? "w-full" : "w-fit",
                                    loading ? "cursor-progress" : "cursor-pointer"
                                )}
                                title={`${label} position ${idx}: "${token.text}"`}
                            >
                                {result}
                            </span>
                            {numNewlines > 0 && "\n".repeat(numNewlines)}
                        </span>
                    );
                })
            )}
        </div>
    );
}

// Prompt section component for reusability
function PromptSection({
    label,
    prompt,
    setPrompt,
    tokens,
    selectedPos,
    onTokenClick,
    isEditing,
    setIsEditing,
    onBlur,
    isExecuting,
    tokenizedModel,
    selectedModel,
    textareaRef,
    tokenContainerRef,
}: {
    label: string;
    prompt: string;
    setPrompt: (value: string) => void;
    tokens: Token[];
    selectedPos: number | null;
    onTokenClick: (pos: number) => void;
    isEditing: boolean;
    setIsEditing: (value: boolean) => void;
    onBlur: () => void;
    isExecuting: boolean;
    tokenizedModel: string | null;
    selectedModel: string;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    tokenContainerRef: React.RefObject<HTMLDivElement | null>;
}) {
    const modelMismatch = tokenizedModel && tokenizedModel !== selectedModel && tokens.length > 0;

    const handleEditClick = useCallback(() => {
        if (isExecuting) return;
        setIsEditing(true);
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                const length = textareaRef.current.value.length;
                textareaRef.current.setSelectionRange(length, length);
            }
        }, 0);
    }, [isExecuting, setIsEditing, textareaRef]);

    // Auto-resize textarea
    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [prompt, isEditing, textareaRef]);

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">{label}</Label>
                {selectedPos !== null && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <MousePointerClick className="w-3 h-3" />
                        Token {selectedPos} selected
                    </span>
                )}
            </div>
            <div className="relative">
                {isEditing ? (
                    <Textarea
                        ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onBlur={onBlur}
                        className="w-full !text-sm bg-input/30 min-h-24 !leading-5"
                        placeholder={`Enter ${label.toLowerCase()} here...`}
                        disabled={isExecuting}
                    />
                ) : (
                    <div
                        ref={tokenContainerRef}
                        className={cn(
                            "flex w-full px-3 py-2 bg-input/30 border rounded min-h-24",
                            isExecuting ? "cursor-progress" : "cursor-text"
                        )}
                        onClick={handleEditClick}
                    >
                        <SelectableTokenDisplay
                            tokens={tokens}
                            loading={isExecuting}
                            selectedPos={selectedPos}
                            onTokenClick={(pos) => {
                                // Don't switch to edit mode when clicking a token
                                onTokenClick(pos);
                            }}
                            label={label}
                        />
                    </div>
                )}

                {/* Model mismatch warning */}
                {modelMismatch && !isExecuting && !isEditing && (
                    <Tooltip>
                        <TooltipTrigger className="absolute bottom-2 right-2">
                            <TriangleAlert className="w-4 h-4 text-destructive/70" />
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                            <p className="w-36 text-wrap text-center">
                                Tokenization does not match the selected model. Please retokenize.
                            </p>
                        </TooltipContent>
                    </Tooltip>
                )}
            </div>
        </div>
    );
}

export function ActivationPatchingControls({
    initialConfig,
    selectedModel,
}: ActivationPatchingControlsProps) {
    const { workspaceId, chartId } = useParams<{ workspaceId: string; chartId: string }>();

    // Source prompt state
    const [srcPrompt, setSrcPrompt] = useState(initialConfig.data?.srcPrompt || "");
    const [srcTokens, setSrcTokens] = useState<Token[]>([]);
    const [srcPos, setSrcPos] = useState<number | null>(initialConfig.data?.srcPos ?? null);
    const [srcEditing, setSrcEditing] = useState(true);
    const [srcTokenizedModel, setSrcTokenizedModel] = useState<string | null>(null);
    const srcTextareaRef = useRef<HTMLTextAreaElement>(null);
    const srcTokenContainerRef = useRef<HTMLDivElement>(null);
    const lastSyncedSrcPromptRef = useRef<string>(initialConfig.data?.srcPrompt || "");

    // Target prompt state
    const [tgtPrompt, setTgtPrompt] = useState(initialConfig.data?.tgtPrompt || "");
    const [tgtTokens, setTgtTokens] = useState<Token[]>([]);
    const [tgtPos, setTgtPos] = useState<number | null>(initialConfig.data?.tgtPos ?? null);
    const [tgtEditing, setTgtEditing] = useState(true);
    const [tgtTokenizedModel, setTgtTokenizedModel] = useState<string | null>(null);
    const tgtTextareaRef = useRef<HTMLTextAreaElement>(null);
    const tgtTokenContainerRef = useRef<HTMLDivElement>(null);
    const lastSyncedTgtPromptRef = useRef<string>(initialConfig.data?.tgtPrompt || "");

    // Mutations
    const { mutateAsync: computePatching, isPending: isComputing } = useActivationPatching();
    const { mutateAsync: updateConfig, isPending: isUpdatingConfig } = useUpdateChartConfig();

    const isExecuting = isComputing || isUpdatingConfig;

    // Sync prompts from config
    useEffect(() => {
        const configSrcPrompt = initialConfig.data?.srcPrompt || "";
        if (configSrcPrompt && configSrcPrompt !== lastSyncedSrcPromptRef.current) {
            setSrcPrompt(configSrcPrompt);
            lastSyncedSrcPromptRef.current = configSrcPrompt;
        }
        const configTgtPrompt = initialConfig.data?.tgtPrompt || "";
        if (configTgtPrompt && configTgtPrompt !== lastSyncedTgtPromptRef.current) {
            setTgtPrompt(configTgtPrompt);
            lastSyncedTgtPromptRef.current = configTgtPrompt;
        }
        // Sync positions
        if (initialConfig.data?.srcPos !== undefined) {
            setSrcPos(initialConfig.data.srcPos);
        }
        if (initialConfig.data?.tgtPos !== undefined) {
            setTgtPos(initialConfig.data.tgtPos);
        }
    }, [initialConfig.data]);

    // Tokenize prompts on initial load if they exist
    useEffect(() => {
        const fetchTokens = async () => {
            if (initialConfig.data?.srcPrompt && selectedModel) {
                const tokens = await encodeText(initialConfig.data.srcPrompt, selectedModel);
                if (tokens.length > 0) {
                    setSrcTokens(tokens);
                    setSrcTokenizedModel(selectedModel);
                    setSrcEditing(false);
                }
            }
            if (initialConfig.data?.tgtPrompt && selectedModel) {
                const tokens = await encodeText(initialConfig.data.tgtPrompt, selectedModel);
                if (tokens.length > 0) {
                    setTgtTokens(tokens);
                    setTgtTokenizedModel(selectedModel);
                    setTgtEditing(false);
                }
            }
        };
        fetchTokens();
    }, [initialConfig.id, selectedModel]);

    // Handle tokenization for source prompt
    const handleSrcTokenize = useCallback(async () => {
        if (!srcPrompt.trim()) return;
        const tokens = await encodeText(srcPrompt, selectedModel);
        if (tokens.length > 0) {
            setSrcTokens(tokens);
            setSrcTokenizedModel(selectedModel);
            setSrcEditing(false);
            // Reset position if tokens changed
            if (srcPos !== null && srcPos >= tokens.length) {
                setSrcPos(null);
            }
        }
    }, [srcPrompt, selectedModel, srcPos]);

    // Handle tokenization for target prompt
    const handleTgtTokenize = useCallback(async () => {
        if (!tgtPrompt.trim()) return;
        const tokens = await encodeText(tgtPrompt, selectedModel);
        if (tokens.length > 0) {
            setTgtTokens(tokens);
            setTgtTokenizedModel(selectedModel);
            setTgtEditing(false);
            // Reset position if tokens changed
            if (tgtPos !== null && tgtPos >= tokens.length) {
                setTgtPos(null);
            }
        }
    }, [tgtPrompt, selectedModel, tgtPos]);

    // Handle blur for source
    const handleSrcBlur = useCallback(() => {
        setTimeout(() => {
            const activeElement = document.activeElement;
            const withinTextarea = activeElement && srcTextareaRef.current?.contains(activeElement);
            const withinToken = activeElement && srcTokenContainerRef.current?.contains(activeElement);
            const popoverOpen = document.querySelector("[data-radix-popper-content-wrapper]");

            if (withinTextarea || withinToken || popoverOpen) return;

            if (srcPrompt.trim()) {
                handleSrcTokenize();
            }
        }, 100);
    }, [srcPrompt, handleSrcTokenize]);

    // Handle blur for target
    const handleTgtBlur = useCallback(() => {
        setTimeout(() => {
            const activeElement = document.activeElement;
            const withinTextarea = activeElement && tgtTextareaRef.current?.contains(activeElement);
            const withinToken = activeElement && tgtTokenContainerRef.current?.contains(activeElement);
            const popoverOpen = document.querySelector("[data-radix-popper-content-wrapper]");

            if (withinTextarea || withinToken || popoverOpen) return;

            if (tgtPrompt.trim()) {
                handleTgtTokenize();
            }
        }, 100);
    }, [tgtPrompt, handleTgtTokenize]);

    // Handle form submission
    const handleSubmit = useCallback(async () => {
        const trimmedSrcPrompt = srcPrompt.trim();
        const trimmedTgtPrompt = tgtPrompt.trim();

        if (!trimmedSrcPrompt || !trimmedTgtPrompt) {
            toast.error("Please enter both source and target prompts.");
            return;
        }

        if (srcPos === null || tgtPos === null) {
            toast.error("Please select a token position in both prompts.");
            return;
        }

        // Tokenize both prompts to ensure they're in sync
        const srcToks = await encodeText(trimmedSrcPrompt, selectedModel);
        const tgtToks = await encodeText(trimmedTgtPrompt, selectedModel);

        if (srcToks.length <= 1 || tgtToks.length <= 1) {
            toast.error("Please enter longer prompts.");
            return;
        }

        setSrcTokens(srcToks);
        setTgtTokens(tgtToks);
        setSrcTokenizedModel(selectedModel);
        setTgtTokenizedModel(selectedModel);

        const config: ActivationPatchingConfigData = {
            model: selectedModel,
            srcPrompt: trimmedSrcPrompt,
            tgtPrompt: trimmedTgtPrompt,
            srcPos,
            tgtPos,
        };

        // Compute the activation patching visualization
        await computePatching({
            request: {
                completion: config,
                chartId,
            },
            configId: initialConfig.id,
        });

        // Update the config in the database
        await updateConfig({
            configId: initialConfig.id,
            config: {
                data: config,
                workspaceId,
                type: "activation-patching",
            },
        });

        lastSyncedSrcPromptRef.current = trimmedSrcPrompt;
        lastSyncedTgtPromptRef.current = trimmedTgtPrompt;
        setSrcEditing(false);
        setTgtEditing(false);
    }, [
        srcPrompt,
        tgtPrompt,
        srcPos,
        tgtPos,
        selectedModel,
        chartId,
        initialConfig.id,
        workspaceId,
        computePatching,
        updateConfig,
    ]);

    // Check if ready to run
    const canRun =
        srcPrompt.trim() &&
        tgtPrompt.trim() &&
        srcPos !== null &&
        tgtPos !== null &&
        !isExecuting;

    return (
        <div className="flex flex-col gap-6">
            {/* Source Prompt */}
            <PromptSection
                label="Source Prompt"
                prompt={srcPrompt}
                setPrompt={setSrcPrompt}
                tokens={srcTokens}
                selectedPos={srcPos}
                onTokenClick={(pos) => setSrcPos(pos === srcPos ? null : pos)}
                isEditing={srcEditing}
                setIsEditing={setSrcEditing}
                onBlur={handleSrcBlur}
                isExecuting={isExecuting}
                tokenizedModel={srcTokenizedModel}
                selectedModel={selectedModel}
                textareaRef={srcTextareaRef}
                tokenContainerRef={srcTokenContainerRef}
            />

            {/* Target Prompt */}
            <PromptSection
                label="Target Prompt"
                prompt={tgtPrompt}
                setPrompt={setTgtPrompt}
                tokens={tgtTokens}
                selectedPos={tgtPos}
                onTokenClick={(pos) => setTgtPos(pos === tgtPos ? null : pos)}
                isEditing={tgtEditing}
                setIsEditing={setTgtEditing}
                onBlur={handleTgtBlur}
                isExecuting={isExecuting}
                tokenizedModel={tgtTokenizedModel}
                selectedModel={selectedModel}
                textareaRef={tgtTextareaRef}
                tokenContainerRef={tgtTokenContainerRef}
            />

            {/* Instructions */}
            <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-md">
                <p className="font-medium mb-1">How to use:</p>
                <ol className="list-decimal list-inside space-y-1">
                    <li>Enter a source and target prompt</li>
                    <li>Click away to tokenize each prompt</li>
                    <li>Click on a token in each prompt to select the patching positions</li>
                    <li>Click &quot;Run Activation Patching&quot; to compute</li>
                </ol>
            </div>

            {/* Run Button */}
            <Button onClick={handleSubmit} disabled={!canRun} className="w-full">
                {isExecuting ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Computing...
                    </>
                ) : (
                    <>
                        <Play className="mr-2 h-4 w-4" />
                        Run Activation Patching
                    </>
                )}
            </Button>

            {/* Keyboard shortcut hint */}
            <p className="text-xs text-muted-foreground text-center">
                Select tokens from both prompts to enable
            </p>
        </div>
    );
}
