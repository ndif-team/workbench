"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ModelControl } from "@/components/ModelControl";
import { ActivationPatchingLandingInput } from "@/components/ActivationPatchingLandingInput";
import {
    NEUTRAL_PILL_TRIGGER,
    ToolPill,
    WorkspacePill,
} from "@/components/selectors/LaunchSelectors";
import { deriveHeat, isModelRunnable } from "@/components/model-selector/status";
import { useModelsQuery } from "@/lib/api/modelsApi";
import { useWorkspaceLibrary } from "@/lib/api/workspaceApi";
import { useCapture } from "@/lib/analytics";
import { newChartPath } from "@/lib/chartRoutes";
import {
    isToolSupportedForModel,
    toolTypeFromDisplay,
    unsupportedReasonFor,
} from "@/lib/toolSupport";
import { useWorkspace } from "@/stores/useWorkspace";
import type { SourcePosition } from "@/types/activationPatching";
import type { Token } from "@/types/models";

/**
 * The home page's composer: a prompt, the tool to run on it, the model (the
 * header's `ModelControl`, so the pick carries over from and to the charts)
 * and, when the user has folders, the workspace to file the chart in. Running
 * it creates the chart through `/new`, which opens it and runs the prompt.
 * Activation patching takes its two prompts and token positions instead.
 */
export function HomeComposer() {
    const router = useRouter();
    const capture = useCapture();
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const [tool, setTool] = useState("Logit Lens");
    const [workspaceId, setWorkspaceId] = useState("");
    const [prompt, setPrompt] = useState("");
    const [srcPrompt, setSrcPrompt] = useState("");
    const [tgtPrompt, setTgtPrompt] = useState("");
    const [srcTokens, setSrcTokens] = useState<Token[]>([]);
    const [tgtTokens, setTgtTokens] = useState<Token[]>([]);
    const [srcPos, setSrcPos] = useState<SourcePosition[]>([]);
    const [tgtPos, setTgtPos] = useState<number[]>([]);
    const [tgtFreeze, setTgtFreeze] = useState<number[]>([]);

    const { data: models } = useModelsQuery();
    const { selectedModelIdx, setSelectedModelIdx } = useWorkspace();
    const { data: library } = useWorkspaceLibrary();
    const folders = library?.workspaces.filter((ws) => !ws.isWorkshop) ?? [];

    const model = models?.[selectedModelIdx] ?? models?.[0];
    const toolType = toolTypeFromDisplay(tool);
    const isPatching = tool === "Activation Patching";

    useEffect(() => textareaRef.current?.focus(), []);

    // Start on a model that runs right away, as the landing page does, unless
    // the selection carried over from a chart already does.
    const seededRef = useRef(false);
    useEffect(() => {
        if (seededRef.current || !models || models.length === 0) return;
        seededRef.current = true;
        const current = models[selectedModelIdx];
        if (current && isModelRunnable(current) && current.allowed) return;
        const idx = models.findIndex((m) => m.status === "hot" && m.allowed);
        if (idx !== -1) setSelectedModelIdx(idx);
    }, [models, selectedModelIdx, setSelectedModelIdx]);

    const gated = !!model && deriveHeat(model) === "gated";
    const unsupportedReason =
        model && toolType && !isToolSupportedForModel(toolType, model)
            ? unsupportedReasonFor(toolType)
            : null;
    const hasInput = isPatching
        ? !!srcPrompt.trim() &&
          !!tgtPrompt.trim() &&
          srcPos.length > 0 &&
          srcPos.length === tgtPos.length
        : !!prompt.trim();
    const canRun = !!model && !gated && !unsupportedReason && hasInput;

    const run = () => {
        if (!canRun || !model) return;
        const params = new URLSearchParams({ model: model.name, tool });
        if (isPatching) {
            params.set("srcPrompt", srcPrompt);
            params.set("tgtPrompt", tgtPrompt);
            params.set("srcPos", JSON.stringify(srcPos));
            params.set("tgtPos", JSON.stringify(tgtPos));
            if (tgtFreeze.length > 0) params.set("tgtFreeze", JSON.stringify(tgtFreeze));
        } else {
            params.set("prompt", prompt.trim());
        }
        if (workspaceId) params.set("workspaceId", workspaceId);
        capture("chart_created", { tool: toolType });
        router.push(newChartPath(params));
    };

    const toolbar = (
        <div className="flex flex-wrap items-center gap-2">
            <ToolPill
                value={tool}
                onChange={setTool}
                disabled={false}
                triggerClassName={NEUTRAL_PILL_TRIGGER}
                compact={false}
            />
            <ModelControl tool={toolType} />
            {folders.length > 0 && (
                <WorkspacePill
                    value={workspaceId}
                    onChange={setWorkspaceId}
                    disabled={false}
                    workspaces={folders}
                    triggerClassName={NEUTRAL_PILL_TRIGGER}
                    compact={false}
                />
            )}
            <Tooltip>
                <TooltipTrigger asChild>
                    {/* Wrapped so the tooltip still shows while the button is disabled. */}
                    <span className="ml-auto">
                        <Button type="submit" disabled={!canRun}>
                            <Play />
                            Run {tool}
                        </Button>
                    </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">⌘ / Ctrl + Enter</TooltipContent>
            </Tooltip>
        </div>
    );

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 pb-24 pt-6">
                <div className="flex flex-col gap-1 text-center">
                    <h1 className="text-xl font-medium">Start a chart</h1>
                    <p className="text-sm text-muted-foreground">
                        Run a tool on a prompt, or open a chart from the sidebar.
                    </p>
                </div>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        run();
                    }}
                    className="flex flex-col gap-3 rounded border bg-secondary/80 p-3 dark:bg-secondary/50"
                >
                    {isPatching ? (
                        <ActivationPatchingLandingInput
                            srcPrompt={srcPrompt}
                            setSrcPrompt={setSrcPrompt}
                            tgtPrompt={tgtPrompt}
                            setTgtPrompt={setTgtPrompt}
                            srcTokens={srcTokens}
                            setSrcTokens={setSrcTokens}
                            tgtTokens={tgtTokens}
                            setTgtTokens={setTgtTokens}
                            srcPos={srcPos}
                            setSrcPos={setSrcPos}
                            tgtPos={tgtPos}
                            setTgtPos={setTgtPos}
                            tgtFreeze={tgtFreeze}
                            setTgtFreeze={setTgtFreeze}
                            selectedModel={model?.name ?? ""}
                        />
                    ) : (
                        <Textarea
                            ref={textareaRef}
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={(e) => {
                                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                                    e.preventDefault();
                                    run();
                                }
                            }}
                            aria-label="Prompt"
                            placeholder="Enter your prompt here..."
                            className="min-h-32 resize-none bg-input/30 !text-sm !leading-5"
                        />
                    )}
                    {toolbar}
                </form>
                {(gated || unsupportedReason) && (
                    <p className="text-center text-sm text-muted-foreground" role="status">
                        {gated ? (
                            <>
                                <Link href="/login" className="underline underline-offset-4">
                                    Sign in
                                </Link>{" "}
                                to run this model.
                            </>
                        ) : (
                            unsupportedReason
                        )}
                    </p>
                )}
            </div>
        </div>
    );
}
