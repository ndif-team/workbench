"use server";

import { db } from "@/db/client";
import { workshopAnnotations, type WorkshopAnnotation } from "@/db/schema";
import { and, eq, asc } from "drizzle-orm";

/**
 * Upsert by (sessionId, exampleId). Workshop participants own their data via
 * an anonymous session-id cookie; participantId is optional (used only when a
 * facilitator wants to identify rows post-session).
 */
export async function upsertWorkshopAnnotation(input: {
    sessionId: string;
    exampleId: string;
    participantId?: string | null;
    annotationText?: string;
    framingResponse?: string;
}): Promise<WorkshopAnnotation> {
    const existing = await db
        .select()
        .from(workshopAnnotations)
        .where(
            and(
                eq(workshopAnnotations.sessionId, input.sessionId),
                eq(workshopAnnotations.exampleId, input.exampleId),
            ),
        )
        .limit(1);

    if (existing.length > 0) {
        const updates: Record<string, unknown> = {};
        if (input.annotationText !== undefined) updates.annotationText = input.annotationText;
        if (input.framingResponse !== undefined) updates.framingResponse = input.framingResponse;
        if (input.participantId !== undefined) updates.participantId = input.participantId;

        if (Object.keys(updates).length === 0) {
            return existing[0];
        }

        const [updated] = await db
            .update(workshopAnnotations)
            .set(updates)
            .where(eq(workshopAnnotations.id, existing[0].id))
            .returning();
        return updated;
    }

    const [inserted] = await db
        .insert(workshopAnnotations)
        .values({
            sessionId: input.sessionId,
            exampleId: input.exampleId,
            participantId: input.participantId ?? null,
            annotationText: input.annotationText ?? "",
            framingResponse: input.framingResponse ?? "",
        })
        .returning();
    return inserted;
}

export async function getWorkshopAnnotation(
    sessionId: string,
    exampleId: string,
): Promise<WorkshopAnnotation | null> {
    const [row] = await db
        .select()
        .from(workshopAnnotations)
        .where(
            and(
                eq(workshopAnnotations.sessionId, sessionId),
                eq(workshopAnnotations.exampleId, exampleId),
            ),
        )
        .limit(1);
    return row ?? null;
}

export async function getSessionAnnotations(sessionId: string): Promise<WorkshopAnnotation[]> {
    return await db
        .select()
        .from(workshopAnnotations)
        .where(eq(workshopAnnotations.sessionId, sessionId))
        .orderBy(asc(workshopAnnotations.createdAt));
}

export async function deleteSessionAnnotations(sessionId: string): Promise<void> {
    await db
        .delete(workshopAnnotations)
        .where(eq(workshopAnnotations.sessionId, sessionId));
}
