"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Image as ImageIcon, Loader2, Play, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { useUpdateChartConfig } from "@/lib/api/configApi";
import { useVlmLens } from "@/lib/api/vlmLensApi";
import { useVlmLensImage } from "@/stores/useVlmLensImage";
import { VlmLensConfigData } from "@/types/vlmLens";

interface VlmLensConfig {
    id: string;
    data: VlmLensConfigData;
    type: string;
}

interface Props {
    initialConfig: VlmLensConfig;
    selectedModel: string;
    hasExistingData?: boolean;
}

const MAX_IMAGE_MB = 10;

async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => {
            const result = reader.result as string;
            // dataUrl form: "data:image/png;base64,<b64>"
            const comma = result.indexOf(",");
            resolve(comma === -1 ? result : result.slice(comma + 1));
        };
        reader.readAsDataURL(file);
    });
}

export function VlmLensControls({ initialConfig, selectedModel, hasExistingData = false }: Props) {
    const { workspaceId, chartId } = useParams<{ workspaceId: string; chartId: string }>();

    const initialPrompt =
        initialConfig.data?.prompt ?? "USER: <image>\nDescribe the image. ASSISTANT:";
    const initialTopk = initialConfig.data?.topK ?? 5;

    const [prompt, setPrompt] = useState(initialPrompt);
    const [topK, setTopK] = useState(initialTopk);
    const [dragging, setDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const imageEntry = useVlmLensImage((s) => s.byChart[chartId]);
    const setImage = useVlmLensImage((s) => s.set);
    const clearImage = useVlmLensImage((s) => s.clear);

    const { mutateAsync: computeVlmLens, isPending: isComputing } = useVlmLens();
    const { mutateAsync: updateConfig, isPending: isUpdatingConfig } = useUpdateChartConfig();
    const isExecuting = isComputing || isUpdatingConfig;

    // Sync prompt from config when it changes externally.
    const lastSyncedPrompt = useRef(initialPrompt);
    useEffect(() => {
        const cp = initialConfig.data?.prompt ?? "";
        if (cp && cp !== lastSyncedPrompt.current) {
            setPrompt(cp);
            lastSyncedPrompt.current = cp;
        }
    }, [initialConfig.data?.prompt]);

    const handleFile = useCallback(
        async (file: File) => {
            if (!file.type.startsWith("image/")) {
                toast.error("Please upload an image file.");
                return;
            }
            if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
                toast.error(`Image is too large (max ${MAX_IMAGE_MB} MB).`);
                return;
            }
            try {
                const b64 = await fileToBase64(file);
                setImage(chartId, {
                    b64,
                    dataUrl: `data:${file.type};base64,${b64}`,
                    filename: file.name,
                    mimeType: file.type,
                });
            } catch {
                toast.error("Could not read the image file.");
            }
        },
        [chartId, setImage],
    );

    const onPickClick = () => fileInputRef.current?.click();
    const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) await handleFile(file);
        e.target.value = ""; // allow re-selecting the same file
    };

    const onDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) await handleFile(file);
    };
    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(true);
    };
    const onDragLeave = () => setDragging(false);

    const handleSubmit = useCallback(async () => {
        if (!prompt.trim()) {
            toast.error("Please enter a prompt.");
            return;
        }
        if (!imageEntry) {
            toast.error("Please attach an image.");
            return;
        }

        const cfg: VlmLensConfigData = {
            model: selectedModel,
            prompt,
            topK,
            imageFilename: imageEntry.filename,
        };

        await computeVlmLens({
            request: {
                chartId,
                model: selectedModel,
                prompt,
                topK,
                imageB64: imageEntry.b64,
            },
            configId: initialConfig.id,
        });

        await updateConfig({
            configId: initialConfig.id,
            chartId,
            config: { data: cfg, workspaceId, type: "vlm-lens" },
        });

        lastSyncedPrompt.current = prompt;
    }, [
        prompt,
        topK,
        imageEntry,
        selectedModel,
        chartId,
        initialConfig.id,
        workspaceId,
        computeVlmLens,
        updateConfig,
    ]);

    const onKeyDown = (e: React.KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div className="flex flex-col gap-4">
            {/* Image input */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Image</Label>
                    {imageEntry && (
                        <button
                            type="button"
                            onClick={() => clearImage(chartId)}
                            disabled={isExecuting}
                            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                        >
                            <X className="w-3 h-3" /> Remove
                        </button>
                    )}
                </div>

                {imageEntry ? (
                    <div className="rounded border bg-input/30 p-2 flex items-center gap-3">
                        <img
                            src={imageEntry.dataUrl}
                            alt={imageEntry.filename}
                            className="h-16 w-16 object-cover rounded"
                        />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{imageEntry.filename}</p>
                            <p className="text-xs text-muted-foreground">
                                {(imageEntry.b64.length * 0.75 / 1024).toFixed(0)} KB
                            </p>
                        </div>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={onPickClick}
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        disabled={isExecuting}
                        className={cn(
                            "flex flex-col items-center justify-center gap-2 rounded border border-dashed p-6 text-sm transition-colors",
                            "bg-input/30 hover:bg-input/50 text-muted-foreground",
                            dragging && "border-primary bg-primary/10 text-foreground",
                            isExecuting && "cursor-not-allowed opacity-60",
                        )}
                    >
                        {dragging ? (
                            <>
                                <Upload className="h-5 w-5" />
                                <span>Drop image to upload</span>
                            </>
                        ) : (
                            <>
                                <ImageIcon className="h-5 w-5" />
                                <span>Click or drag an image (max {MAX_IMAGE_MB} MB)</span>
                            </>
                        )}
                    </button>
                )}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={onFileChange}
                    className="hidden"
                />
                {!imageEntry && hasExistingData && (
                    <p className="text-xs text-muted-foreground">
                        Re-attach the image to enable the segmentation widget. The lens table
                        will render from saved data.
                    </p>
                )}
            </div>

            {/* Prompt */}
            <div className="flex flex-col gap-2">
                <Label htmlFor="vlm-prompt" className="text-sm font-medium">
                    Prompt
                </Label>
                <Textarea
                    id="vlm-prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={onKeyDown}
                    disabled={isExecuting}
                    className="w-full !text-sm bg-input/30 min-h-24 !leading-5"
                    placeholder="USER: <image>\nDescribe the image. ASSISTANT:"
                />
                <p className="text-xs text-muted-foreground">
                    LLaVA-1.5 uses a single <code>&lt;image&gt;</code> placeholder; the
                    processor expands it to 576 image tokens.
                </p>
            </div>

            {/* Top-K */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <Label htmlFor="vlm-topk" className="text-sm font-medium">
                        Top-K Predictions
                    </Label>
                    <span className="text-sm text-muted-foreground tabular-nums">{topK}</span>
                </div>
                <Slider
                    id="vlm-topk"
                    min={1}
                    max={10}
                    step={1}
                    value={[topK]}
                    onValueChange={([v]) => setTopK(v)}
                    disabled={isExecuting}
                    className="w-full"
                />
            </div>

            {/* Run */}
            <Button
                onClick={handleSubmit}
                disabled={isExecuting || !prompt.trim() || !imageEntry}
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
                        Run VLM Logit Lens
                    </>
                )}
            </Button>
        </div>
    );
}
