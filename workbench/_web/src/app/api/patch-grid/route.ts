import { type NextRequest, NextResponse } from "next/server";
import config from "@/lib/config";
import type { ActivationPatchingRequest } from "@/types/patching";
import type { HeatmapData } from "@/types/charts";
import { createUserHeadersAction } from "@/actions/auth";

export interface ActivationPatchingResponse {
  results: number[][];
  rowLabels?: string[];
  colLabels?: string[];
}

function processHeatmapData(data: ActivationPatchingResponse): HeatmapData {
  const { results, rowLabels, colLabels } = data;

  // Generate indices if labels are not provided
  const finalRowLabels =
    rowLabels || Array.from({ length: results.length }, (_, i) => i.toString());
  const finalColLabels =
    colLabels || Array.from({ length: results[0]?.length || 0 }, (_, i) => i.toString());

  return {
    data: results,
    // labels: results.map((row, i) => row.map((_, j) => `${finalRowLabels[i]}, ${finalColLabels[j]}`)),
    xTickLabels: finalColLabels,
    yTickLabels: finalRowLabels,
    xAxisLabel: "Tokens",
    yAxisLabel: "Layers",
  };
}

export async function POST(request: NextRequest) {
  const patchingRequest: ActivationPatchingRequest = await request.json();

  if (!patchingRequest.edits || !patchingRequest.model) {
    return NextResponse.json(
      { error: "Invalid patching request - missing required fields" },
      { status: 400 },
    );
  }

  try {
    const userHeaders = await createUserHeadersAction();
    const response = await fetch(config.getApiUrl(config.endpoints.patch), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...userHeaders,
      },
      body: JSON.stringify(patchingRequest),
    });

    const rawData: ActivationPatchingResponse = await response.json();
    const processedData: HeatmapData = processHeatmapData(rawData);

    return NextResponse.json(processedData, { status: 200 });
  } catch (error) {
    console.error("Error fetching patching data:", error);
    return NextResponse.json({ error: "Failed to fetch patching data" }, { status: 500 });
  }
}
