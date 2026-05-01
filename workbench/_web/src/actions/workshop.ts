"use server";

import { cookies } from "next/headers";
import {
    upsertWorkshopAnnotation,
    getWorkshopAnnotation,
    getSessionAnnotations,
} from "@/lib/queries/workshopAnnotationQueries";
import type { WorkshopAnnotation } from "@/db/schema";

const WORKSHOP_SESSION_COOKIE = "workshop_session_id";

function generateSessionId(): string {
    return "wkshp-xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * Get-or-create the anonymous workshop session id from a cookie. Workshop mode
 * has no auth — this cookie is the only identity for participant annotations.
 */
export async function getOrCreateWorkshopSessionId(): Promise<string> {
    const store = await cookies();
    const existing = store.get(WORKSHOP_SESSION_COOKIE)?.value;
    if (existing) return existing;

    const fresh = generateSessionId();
    store.set(WORKSHOP_SESSION_COOKIE, fresh, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        // 90 days — long enough that a participant who returns to their summary
        // export later still finds their session intact.
        maxAge: 60 * 60 * 24 * 90,
    });
    return fresh;
}

export async function saveWorkshopAnnotation(input: {
    exampleId: string;
    annotationText?: string;
    framingResponse?: string;
    participantId?: string | null;
}): Promise<WorkshopAnnotation> {
    const sessionId = await getOrCreateWorkshopSessionId();
    return await upsertWorkshopAnnotation({
        sessionId,
        exampleId: input.exampleId,
        annotationText: input.annotationText,
        framingResponse: input.framingResponse,
        participantId: input.participantId,
    });
}

export async function loadWorkshopAnnotation(
    exampleId: string,
): Promise<WorkshopAnnotation | null> {
    const sessionId = await getOrCreateWorkshopSessionId();
    return await getWorkshopAnnotation(sessionId, exampleId);
}

export async function loadSessionAnnotations(): Promise<WorkshopAnnotation[]> {
    const sessionId = await getOrCreateWorkshopSessionId();
    return await getSessionAnnotations(sessionId);
}
