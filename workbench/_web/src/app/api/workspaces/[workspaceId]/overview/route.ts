import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { documents } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: { workspaceId: string } }) {
    const { workspaceId } = params;
    const [doc] = await db.select().from(documents).where(eq(documents.workspaceId, workspaceId));
    if (!doc) {
        // Default paragraph content for Editor.js
        const content = { time: Date.now(), blocks: [{ type: "paragraph", data: { text: "" } }], version: "2.29.0" };
        return NextResponse.json({ content });
    }
    return NextResponse.json({ content: doc.content });
}

export async function PUT(req: NextRequest, { params }: { params: { workspaceId: string } }) {
    const { workspaceId } = params;
    const { content } = await req.json();
    if (!content) return NextResponse.json({ error: "Missing content" }, { status: 400 });

    const existing = await db.select().from(documents).where(eq(documents.workspaceId, workspaceId));
    if (existing.length === 0) {
        await db.insert(documents).values({ workspaceId, content });
    } else {
        await db.update(documents).set({ content, updatedAt: new Date() }).where(eq(documents.workspaceId, workspaceId));
    }
    return NextResponse.json({ ok: true });
}