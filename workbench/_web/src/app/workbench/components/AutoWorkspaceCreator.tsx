"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { createWorkspace } from "@/lib/queries/workspaceQueries";
import {
    createLogitLensChartPair,
    createJLensChartPair,
    createActivationPatchingChartPair,
} from "@/lib/queries/chartQueries";
import { queryKeys } from "@/lib/queryKeys";
import { toolChartPath } from "@/lib/chartRoutes";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ToolType } from "@/types/charts";
import type { LogitLensConfigData } from "@/types/logitLens";
import type { JLensConfigData } from "@/types/jlens";
import type { ActivationPatchingConfigData, SourcePosition } from "@/types/activationPatching";

interface AutoWorkspaceCreatorProps {
    userId: string;
    initialPrompt?: string;
    initialModel?: string;
    workspaceName?: string; // Custom workspace name
    existingWorkspaceId?: string; // Use existing workspace instead of creating new
    tool?: string; // Tool type: "Logit Lens" or "Activation Patching"
    srcPrompt?: string; // Activation patching source prompt
    tgtPrompt?: string; // Activation patching target prompt
    srcPos?: string; // JSON-encoded source positions
    tgtPos?: string; // JSON-encoded target positions
    tgtFreeze?: string; // JSON-encoded frozen positions
    deploy?: boolean; // Cold-model deploy: create an empty chart (no prompt) so
    // the chart renders its deploying state and, once hot, ready controls —
    // without auto-running anything.
}

export function AutoWorkspaceCreator({
    userId,
    initialPrompt,
    initialModel,
    workspaceName = "Default Workspace", // Default name
    existingWorkspaceId,
    tool = "Logit Lens",
    srcPrompt,
    tgtPrompt,
    srcPos,
    tgtPos,
    tgtFreeze,
    deploy = false,
}: AutoWorkspaceCreatorProps) {
    const [error, setError] = useState<string | null>(null);
    const hasStartedRef = useRef(false);
    const router = useRouter();
    const queryClient = useQueryClient();

    useEffect(() => {
        const createAndRedirect = async () => {
            if (hasStartedRef.current) return; // Prevent double execution

            hasStartedRef.current = true;
            setError(null);

            try {
                let targetWorkspaceId: string;

                if (existingWorkspaceId) {
                    // Use existing workspace — skip creation and seeding
                    console.log("Using existing workspace:", existingWorkspaceId);
                    targetWorkspaceId = existingWorkspaceId;
                } else {
                    console.log(
                        "Creating workspace for user:",
                        userId,
                        "with name:",
                        workspaceName,
                    );
                    const newWorkspace = await createWorkspace(userId, workspaceName);
                    console.log("Created workspace:", newWorkspace);
                    targetWorkspaceId = newWorkspace.id;
                }

                // If user submitted a prompt from landing page, create a chart for it
                let userChartId: string | null = null;
                let chartType: ToolType = "logit-lens";

                if (deploy) {
                    // Cold-model deploy: create an EMPTY chart of the chosen
                    // tool so the user lands in the chart's deploying state and,
                    // once the model is hot, ready (un-run) controls.
                    const model = initialModel || "openai-community/gpt2";
                    if (tool === "Activation Patching") {
                        const apConfig: ActivationPatchingConfigData = {
                            model,
                            srcPrompt: "",
                            tgtPrompt: "",
                            srcPos: [],
                            tgtPos: [],
                            tgtFreeze: [],
                        };
                        const { chart } = await createActivationPatchingChartPair(
                            targetWorkspaceId,
                            apConfig,
                        );
                        userChartId = chart.id;
                        chartType = "activation-patching";
                    } else if (tool === "J-Lens") {
                        const jlensConfig: JLensConfigData = {
                            model,
                            prompt: "",
                            topk: 5,
                            includeEntropy: true,
                        };
                        const { chart } = await createJLensChartPair(
                            targetWorkspaceId,
                            jlensConfig,
                        );
                        userChartId = chart.id;
                        chartType = "jlens";
                    } else {
                        const lensConfig: LogitLensConfigData = {
                            model,
                            prompt: "",
                            topk: 5,
                            includeEntropy: true,
                        };
                        const { chart } = await createLogitLensChartPair(
                            targetWorkspaceId,
                            lensConfig,
                        );
                        userChartId = chart.id;
                    }
                } else if (
                    tool === "Activation Patching" &&
                    srcPrompt &&
                    tgtPrompt &&
                    srcPos &&
                    tgtPos
                ) {
                    // Create activation patching chart
                    console.log("Creating activation patching chart");
                    const parsedSrcPos: SourcePosition[] = JSON.parse(srcPos);
                    const parsedTgtPos: number[] = JSON.parse(tgtPos);
                    const parsedTgtFreeze: number[] = tgtFreeze ? JSON.parse(tgtFreeze) : [];

                    const apConfig: ActivationPatchingConfigData = {
                        model: initialModel || "openai-community/gpt2",
                        srcPrompt: srcPrompt,
                        tgtPrompt: tgtPrompt,
                        srcPos: parsedSrcPos,
                        tgtPos: parsedTgtPos,
                        tgtFreeze: parsedTgtFreeze,
                    };

                    const { chart } = await createActivationPatchingChartPair(
                        targetWorkspaceId,
                        apConfig,
                    );
                    userChartId = chart.id;
                    chartType = "activation-patching";
                    console.log("Created activation patching chart:", userChartId);
                } else if (
                    tool === "J-Lens" &&
                    initialPrompt &&
                    initialPrompt.trim() &&
                    initialModel
                ) {
                    console.log("Creating j-lens chart for user prompt:", initialPrompt);
                    const jlensChartConfig: JLensConfigData = {
                        prompt: initialPrompt,
                        model: initialModel,
                        topk: 5,
                        includeEntropy: true,
                    };

                    const { chart } = await createJLensChartPair(
                        targetWorkspaceId,
                        jlensChartConfig,
                    );
                    userChartId = chart.id;
                    chartType = "jlens";
                    console.log("Created user j-lens chart:", userChartId);
                } else if (initialPrompt && initialPrompt.trim() && initialModel) {
                    console.log("Creating logit lens chart for user prompt:", initialPrompt);
                    const userChartConfig: LogitLensConfigData = {
                        prompt: initialPrompt,
                        model: initialModel,
                        topk: 5,
                        includeEntropy: true,
                    };

                    const { chart } = await createLogitLensChartPair(
                        targetWorkspaceId,
                        userChartConfig,
                    );
                    userChartId = chart.id;
                    console.log("Created user logit lens chart:", userChartId);
                }

                // The chart was created via the server action directly (not the
                // mutation hooks), so nothing invalidated the sidebar list.
                // Refresh it, otherwise the new chart exists but has no card in
                // the sidebar — unreachable once you navigate away — until a
                // full reload.
                if (userChartId) {
                    queryClient.invalidateQueries({
                        queryKey: queryKeys.charts.sidebar(targetWorkspaceId),
                    });
                }

                // Small delay to ensure the workspace is fully created
                setTimeout(() => {
                    if (userChartId) {
                        router.push(toolChartPath(targetWorkspaceId, userChartId, chartType));
                    } else {
                        router.push(`/workbench/${targetWorkspaceId}`);
                    }
                }, 500);
            } catch (err) {
                console.error("Failed to create workspace:", err);
                setError(err instanceof Error ? err.message : "Failed to create workspace");
                hasStartedRef.current = false; // Reset on error so user can retry
            }
        };

        createAndRedirect();
    }, [
        userId,
        router,
        initialPrompt,
        initialModel,
        workspaceName,
        existingWorkspaceId,
        tool,
        srcPrompt,
        tgtPrompt,
        srcPos,
        tgtPos,
        tgtFreeze,
        deploy,
        queryClient,
    ]);

    if (error) {
        return (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
                <h2 className="mb-2 text-lg font-semibold text-destructive">
                    Error creating workspace
                </h2>
                <p className="mb-4 text-sm text-muted-foreground">{error}</p>
                <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                        setError(null);
                        hasStartedRef.current = false;
                        // Force re-render to trigger useEffect
                        window.location.reload();
                    }}
                >
                    Try again
                </Button>
            </div>
        );
    }

    const statusMessage = existingWorkspaceId
        ? "Adding new chart to your workspace…"
        : `Creating ${workspaceName === "Untitled" ? "new" : "default"} workspace…`;

    return (
        <div className="rounded-md border border-primary/20 bg-primary/5 p-4">
            <h2 className="mb-2 text-lg font-semibold text-foreground">
                Setting up your workspace…
            </h2>
            <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{statusMessage}</p>
            </div>
        </div>
    );
}
