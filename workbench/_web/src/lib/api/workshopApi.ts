import config from "@/lib/config";
import type { WorkshopExamplePayload } from "@/types/workshop";

/**
 * Fetch a pre-cached workshop example payload from the backend. Used by the
 * server-side `/workshop/[exampleId]` page so workshop participants never
 * wait on live NDIF compute.
 */
export async function fetchWorkshopExample(
    exampleId: string,
): Promise<WorkshopExamplePayload | null> {
    const url = config.getApiUrl(config.endpoints.workshopExample(exampleId));
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) {
        throw new Error(`workshop example fetch failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as WorkshopExamplePayload;
}
