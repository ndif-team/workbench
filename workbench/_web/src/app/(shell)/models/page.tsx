import { getSessionUser, redirectWorkshopParticipant } from "@/lib/auth/user";
import { ModelsSection } from "@/components/models/ModelsSection";
import { PageHeader } from "../components/shell/PageHeader";

export const dynamic = "force-dynamic";

/**
 * The models the backend serves, with filters; a card opens a chart with that
 * model, on the NDIF liquid background (`ndif-liquid`). The grid's header row
 * carries the page's title, so the page header shows only on mobile, for the
 * sidebar drawer's button. A workshop participant goes to their
 * workshop instead.
 */
export default async function ModelsPage() {
    const user = await getSessionUser();
    await redirectWorkshopParticipant(user);

    // A real (non-anonymous) sign-in is required to deploy cold models. When
    // absent, ModelsSection renders cold models as gated and inert.
    const isSignedIn =
        process.env.NEXT_PUBLIC_DISABLE_AUTH === "true" || (!!user && !user.is_anonymous);

    return (
        <div className="ndif-liquid flex size-full min-h-0 flex-col">
            <PageHeader className="md:hidden" />
            <div className="min-h-0 flex-1 px-3 pb-3 md:pl-6 md:pt-4">
                <ModelsSection isSignedIn={isSignedIn} />
            </div>
        </div>
    );
}
