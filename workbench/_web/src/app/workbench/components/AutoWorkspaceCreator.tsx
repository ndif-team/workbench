"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createWorkspace } from "@/lib/queries/workspaceQueries";
import { pushTutorialChart } from "@/lib/queries/tutorialChart";
import { createLensChartPair, createActivationPatchingChartPair } from "@/lib/queries/chartQueries";
import type { LensConfigData } from "@/types/lens";
import { Metrics } from "@/types/lens";
import type { ActivationPatchingConfigData, SourcePosition } from "@/types/activationPatching";

interface AutoWorkspaceCreatorProps {
    userId: string;
    initialPrompt?: string;
    initialModel?: string;
    seedWithExamples?: boolean; // New prop to control seeding
    workspaceName?: string; // Custom workspace name
    existingWorkspaceId?: string; // Use existing workspace instead of creating new
    tool?: string; // Tool type: "Logit Lens" or "Activation Patching"
    srcPrompt?: string; // Activation patching source prompt
    tgtPrompt?: string; // Activation patching target prompt
    srcPos?: string; // JSON-encoded source positions
    tgtPos?: string; // JSON-encoded target positions
    tgtFreeze?: string; // JSON-encoded frozen positions
}

export function AutoWorkspaceCreator({
    userId,
    initialPrompt,
    initialModel,
    seedWithExamples = true, // Default to true for new users
    workspaceName = "Default Workspace", // Default name
    existingWorkspaceId,
    tool = "Logit Lens",
    srcPrompt,
    tgtPrompt,
    srcPos,
    tgtPos,
    tgtFreeze,
}: AutoWorkspaceCreatorProps) {
    const [error, setError] = useState<string | null>(null);
    const hasStartedRef = useRef(false);
    const router = useRouter();

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
                    console.log("Creating workspace for user:", userId, "with name:", workspaceName);
                    const newWorkspace = await createWorkspace(userId, workspaceName);
                    console.log("Created workspace:", newWorkspace);
                    targetWorkspaceId = newWorkspace.id;

                    // Seed with example charts if enabled
                    if (seedWithExamples) {
                        console.log("Seeding workspace with example charts...");
                        await pushTutorialChart(targetWorkspaceId);
                        console.log("Successfully seeded workspace with examples");
                    }
                }

                // If user submitted a prompt from landing page, create a chart for it
                let userChartId: string | null = null;
                let chartType: string = "lens";

                if (tool === "Activation Patching" && srcPrompt && tgtPrompt && srcPos && tgtPos) {
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

                    const { chart } = await createActivationPatchingChartPair(targetWorkspaceId, apConfig);
                    userChartId = chart.id;
                    chartType = "activation-patching";
                    console.log("Created activation patching chart:", userChartId);
                } else if (initialPrompt && initialPrompt.trim() && initialModel) {
                    console.log("Creating chart for user prompt:", initialPrompt);
                    const userChartConfig: LensConfigData = {
                        prompt: initialPrompt,
                        model: initialModel,
                        statisticType: Metrics.PROBABILITY,
                        token: { idx: 0, id: 0, text: "", targetIds: [] },
                    };

                    const { chart } = await createLensChartPair(targetWorkspaceId, userChartConfig);
                    userChartId = chart.id;
                    console.log("Created user chart:", userChartId);
                }

                // Small delay to ensure the workspace is fully created
                setTimeout(() => {
                    if (userChartId) {
                        if (chartType === "activation-patching") {
                            router.push(`/workbench/${targetWorkspaceId}/activation-patching/${userChartId}`);
                        } else {
                            router.push(`/workbench/${targetWorkspaceId}/${userChartId}`);
                        }
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
    }, [userId, router, initialPrompt, initialModel, seedWithExamples, workspaceName, existingWorkspaceId, tool, srcPrompt, tgtPrompt, srcPos, tgtPos, tgtFreeze]);

    if (error) {
        return (
            <div className="p-4 border rounded bg-red-50 border-red-200">
                <h2 className="text-lg font-semibold mb-2 text-red-700">
                    Error Creating Workspace
                </h2>
                <p className="mb-4 text-red-600">{error}</p>
                <button
                    onClick={() => {
                        setError(null);
                        hasStartedRef.current = false;
                        // Force re-render to trigger useEffect
                        window.location.reload();
                    }}
                    className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                >
                    Try Again
                </button>
            </div>
        );
    }

    const statusMessage = existingWorkspaceId
        ? "Adding new chart to your workspace..."
        : `Creating ${workspaceName === "Untitled" ? "new" : "default"} workspace...`;

    return (
        <div className="p-4 border rounded bg-blue-50 border-blue-200">
            <h2 className="text-lg font-semibold mb-2">Setting up your workspace...</h2>
            <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                <p className="text-gray-600">{statusMessage}</p>
            </div>
        </div>
    );
}
