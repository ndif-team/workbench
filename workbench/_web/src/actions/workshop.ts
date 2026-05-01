"use server";

import { cookies } from "next/headers";
import {
    upsertWorkshopAnnotation,
    getWorkshopAnnotation,
    getSessionAnnotations,
} from "@/lib/queries/workshopAnnotationQueries";
import type { WorkshopAnnotation } from "@/db/schema";
import { WORKSHOP_SESSION_COOKIE } from "@/lib/workshop-session";
import config from "@/lib/config";
import type { BranchingDrillDown } from "@/types/workshop";

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

/**
 * Generate a forced-token continuation for a branching drill-down. Powers the
 * "Generate full alternate trajectory" button per spec §1.3 / §1.8.
 *
 * Hits POST /branching/continue with X-Workshop-Session so anonymous workshop
 * participants can call it without an X-User-Email. Returns a payload that
 * matches the BranchingDrillDown shape so the UI can render it alongside the
 * pre-cached samples.
 */
export async function generateBranchingAlternate(input: {
    model: string;
    prompt: string;
    sample_idx: number;
    branch_position: number;
    prefix_token_ids: number[];
    forced_next_token_id: number;
    forced_next_token_text: string;
    max_tokens?: number;
}): Promise<BranchingDrillDown> {
    const sessionId = await getOrCreateWorkshopSessionId();
    const url =
        config.getApiUrl("/branching/continue") ?? "/branching/continue";

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Workshop-Session": sessionId,
        },
        body: JSON.stringify({
            model: input.model,
            prompt: input.prompt,
            prefix_token_ids: input.prefix_token_ids,
            forced_next_token_id: input.forced_next_token_id,
            max_tokens: input.max_tokens ?? 60,
            top_k: 5,
        }),
        cache: "no-store",
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`branching/continue failed: ${res.status} ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
        data: {
            continuation_text: string;
            continuation_tokens: BranchingDrillDown["continuation_tokens"];
            per_position_top_k: BranchingDrillDown["per_position_top_k"];
        } | null;
    };
    if (!json.data) {
        throw new Error("branching/continue returned no data");
    }
    return {
        sample_idx: input.sample_idx,
        branch_position: input.branch_position,
        forced_token_id: input.forced_next_token_id,
        forced_token_text: input.forced_next_token_text,
        continuation_text: json.data.continuation_text,
        continuation_tokens: json.data.continuation_tokens,
        per_position_top_k: json.data.per_position_top_k,
    };
}
