import { newChartPath } from "@/lib/chartRoutes";

/**
 * A chart launch that had to wait for sign-in (a gated model picked on the
 * landing page). The login page saves it; after sign-in the app shell resumes
 * it through `/new` (`PendingRequestHandler`, `NewChartCreator`).
 */

// Key for storing pending request in localStorage
const PENDING_REQUEST_KEY = "workbench_pending_request";

export interface PendingRequest {
    model: string;
    tool?: string;
    prompt?: string;
    srcPrompt?: string;
    tgtPrompt?: string;
    srcPos?: string;
    tgtPos?: string;
    tgtFreeze?: string;
    timestamp: number;
}

// Helper to save pending request to localStorage
export function savePendingRequest(request: Omit<PendingRequest, "timestamp">) {
    const payload: PendingRequest = { ...request, timestamp: Date.now() };
    localStorage.setItem(PENDING_REQUEST_KEY, JSON.stringify(payload));
}

// Helper to get and clear pending request from localStorage
export function getPendingRequest(): PendingRequest | null {
    const stored = localStorage.getItem(PENDING_REQUEST_KEY);
    if (!stored) return null;

    try {
        const request = JSON.parse(stored) as PendingRequest;
        // Clear after reading
        localStorage.removeItem(PENDING_REQUEST_KEY);

        // Expire after 10 minutes
        if (Date.now() - request.timestamp > 10 * 60 * 1000) {
            return null;
        }

        return request;
    } catch {
        localStorage.removeItem(PENDING_REQUEST_KEY);
        return null;
    }
}

/** The `/new` URL that resumes a pending request. */
export function pendingRequestPath(request: PendingRequest): string {
    const params = new URLSearchParams({ model: request.model });
    if (request.tool) params.set("tool", request.tool);
    if (request.prompt) params.set("prompt", request.prompt);
    if (request.srcPrompt) params.set("srcPrompt", request.srcPrompt);
    if (request.tgtPrompt) params.set("tgtPrompt", request.tgtPrompt);
    if (request.srcPos) params.set("srcPos", request.srcPos);
    if (request.tgtPos) params.set("tgtPos", request.tgtPos);
    if (request.tgtFreeze) params.set("tgtFreeze", request.tgtFreeze);
    return newChartPath(params);
}
