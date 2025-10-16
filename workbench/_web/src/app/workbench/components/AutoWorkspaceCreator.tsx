"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createWorkspace } from "@/lib/queries/workspaceQueries";
import { pushTutorialChart } from "@/lib/queries/tutorialChart";
import { createLensChartPair } from "@/lib/queries/chartQueries";
import type { LensConfigData } from "@/types/lens";
import { Metrics } from "@/types/lens";

interface AutoWorkspaceCreatorProps {
  userId: string;
  initialPrompt?: string;
  initialModel?: string;
  seedWithExamples?: boolean; // New prop to control seeding
}

export function AutoWorkspaceCreator({
  userId,
  initialPrompt,
  initialModel,
  seedWithExamples = true, // Default to true for new users
}: AutoWorkspaceCreatorProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const createAndRedirect = async () => {
      if (isCreating) return; // Prevent double execution

      setIsCreating(true);
      setError(null);

      try {
        console.log("Creating default workspace for user:", userId);
        const newWorkspace = await createWorkspace(userId, "Default Workspace");
        console.log("Created workspace:", newWorkspace);

        // Seed with example charts if enabled
        if (seedWithExamples) {
          console.log("Seeding workspace with example charts...");
          await pushTutorialChart(newWorkspace.id);
          console.log("Successfully seeded workspace with examples");
        }

        // If user submitted a prompt from landing page, create a chart for it
        let userChartId: string | null = null;
        if (initialPrompt && initialPrompt.trim() && initialModel) {
          console.log("Creating chart for user prompt:", initialPrompt);
          const userChartConfig: LensConfigData = {
            prompt: initialPrompt,
            model: initialModel,
            statisticType: Metrics.PROBABILITY,
            token: { idx: 0, id: 0, text: "", targetIds: [] },
          };

          const { chart } = await createLensChartPair(newWorkspace.id, userChartConfig);
          userChartId = chart.id;
          console.log("Created user chart:", userChartId);
        }

        // Small delay to ensure the workspace is fully created
        setTimeout(() => {
          // If we created a user chart, redirect directly to it
          // The chart page will handle tokenization and running the lens
          if (userChartId) {
            router.push(`/workbench/${newWorkspace.id}/${userChartId}`);
          } else {
            // Otherwise just go to the workspace
            router.push(`/workbench/${newWorkspace.id}`);
          }
        }, 500);
      } catch (err) {
        console.error("Failed to create workspace:", err);
        setError(err instanceof Error ? err.message : "Failed to create workspace");
        setIsCreating(false);
      }
    };

    createAndRedirect();
  }, [userId, router, isCreating, initialPrompt, initialModel, seedWithExamples]);

  if (error) {
    return (
      <div className="p-4 border rounded bg-red-50 border-red-200">
        <h2 className="text-lg font-semibold mb-2 text-red-700">Error Creating Workspace</h2>
        <p className="mb-4 text-red-600">{error}</p>
        <button
          onClick={() => {
            setError(null);
            setIsCreating(false);
          }}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 border rounded bg-blue-50 border-blue-200">
      <h2 className="text-lg font-semibold mb-2">Setting up your workspace...</h2>
      <div className="flex items-center space-x-2">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
        <p className="text-gray-600">Creating your default workspace and redirecting...</p>
      </div>
    </div>
  );
}
