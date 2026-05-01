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
 * Get-or-create the anonymous workshop session id. Cookies can only be set
 * inside Server Actions or Route Handlers (NOT inside server-component
 * renders), so this is the write-path entry point used by the save actions.
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

/**
 * Read-only view of the session id — safe to call from server components
 * (page renders). Returns null if the participant hasn't yet performed any
 * write action that would have created the cookie.
 */
export async function getWorkshopSessionIdReadOnly(): Promise<string | null> {
    const store = await cookies();
    return store.get(WORKSHOP_SESSION_COOKIE)?.value ?? null;
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
    const sessionId = await getWorkshopSessionIdReadOnly();
    if (!sessionId) return null;
    return await getWorkshopAnnotation(sessionId, exampleId);
}

export async function loadSessionAnnotations(): Promise<WorkshopAnnotation[]> {
    const sessionId = await getWorkshopSessionIdReadOnly();
    if (!sessionId) return [];
    return await getSessionAnnotations(sessionId);
}
