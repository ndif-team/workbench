import { redirect } from "next/navigation";
import { getMostRecentChartForWorkspace, createLensChartPair } from "@/lib/queries/chartQueries";
import { LensConfig } from "@/types/lens";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ prompt?: string; model?: string }>;
}) {
  const { workspaceId } = await params;
  const urlParams = await searchParams;
  const initialPrompt = urlParams?.prompt || "";
  const initialModel = urlParams?.model || "";

  // Check if there's an existing chart
  let chart = await getMostRecentChartForWorkspace(workspaceId);

  // If no chart exists, create a new lens chart pair with default config
  if (!chart) {
    const defaultConfig: LensConfig = {
      prompt: initialPrompt,
      model: initialModel,
      token: { idx: 0, id: 0, text: "", targetIds: [] },
    };

    const result = await createLensChartPair(workspaceId, defaultConfig);
    chart = result.chart;
  }

  // Redirect to the chart
  redirect(`/workbench/${workspaceId}/${chart.id}`);
}
