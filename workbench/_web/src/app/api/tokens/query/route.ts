import { NextRequest } from "next/server";
import { queryTokens } from "@/actions/tok";

export async function POST(req: NextRequest) {
  try {
    const { query, model, limit } = await req.json();
    const tokens = await queryTokens(query ?? "", model, limit ?? 50);
    return new Response(JSON.stringify({ tokens }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ tokens: [], error: (error as Error)?.message ?? "Unknown error" }),
      {
        headers: { "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
}
