import { toast } from "sonner";

/**
 * Join-URL construction + clipboard copy for workshop links. Client-only
 * (window/navigator); kept out of lib/workshop.ts, which server actions import.
 */

export const workshopJoinUrl = (slug: string): string => `${window.location.origin}/w/${slug}`;

export async function copyWorkshopJoinLink(
    slug: string,
    successMessage = "Join link copied",
): Promise<void> {
    try {
        await navigator.clipboard.writeText(workshopJoinUrl(slug));
        toast.success(successMessage);
    } catch {
        toast.error("Could not copy join link");
    }
}
