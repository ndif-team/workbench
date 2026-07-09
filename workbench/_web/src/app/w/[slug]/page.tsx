import { notFound } from "next/navigation";

import { getWorkshopBySlug } from "@/lib/queries/workshopQueries";
import { isWorkshopExpired } from "@/lib/workshop";
import { parseProlificParams } from "@/lib/prolific";
import { WorkshopJoin } from "./components/WorkshopJoin";

export const dynamic = "force-dynamic";

/**
 * Workshop join link. Validates the slug and expiry server-side, then hands
 * off to the client container — sign-in has to happen in a server action
 * (server components can't set the session cookies).
 */
export default async function WorkshopJoinPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { slug } = await params;
    // Prolific appends PROLIFIC_PID/STUDY_ID/SESSION_ID to the join link; grab
    // them here (first load) so the join action can retain them for analysis.
    const prolific = parseProlificParams(await searchParams);

    const workshop = await getWorkshopBySlug(slug);
    if (!workshop) {
        notFound();
    }

    if (isWorkshopExpired(workshop)) {
        return (
            <div className="flex min-h-screen items-center justify-center p-4">
                <div className="w-full max-w-md rounded-md border bg-card p-4 shadow-sm">
                    <h1 className="mb-2 text-lg font-semibold text-foreground">
                        This workshop has ended
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        The join link for “{workshop.name}” is no longer active. If you already
                        joined, your workspace is still available by signing in as before.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <div className="w-full max-w-md">
                <WorkshopJoin slug={slug} workshopName={workshop.name} prolific={prolific} />
            </div>
        </div>
    );
}
