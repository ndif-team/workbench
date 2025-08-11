import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { charts } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: { chartId: string } }) {
    const { chartId } = params;
    const [chart] = await db.select().from(charts).where(eq(charts.id, chartId));
    if (!chart) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(chart);
}

export async function PUT(req: NextRequest, { params }: { params: { chartId: string } }) {
    const { chartId } = params;
    const body = await req.json();
    const { name } = body ?? {};
    if (typeof name !== "string" || name.length === 0) {
        return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }
    await db.update(charts).set({ name, updatedAt: new Date() }).where(eq(charts.id, chartId));
    return NextResponse.json({ ok: true });
}