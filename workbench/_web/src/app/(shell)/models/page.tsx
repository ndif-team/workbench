import { getSessionUser, redirectWorkshopParticipant } from "@/lib/auth/user";
import { ModelsSection } from "@/components/models/ModelsSection";
import { ModelsPageHeader } from "./components/ModelsPageHeader";

export const dynamic = "force-dynamic";

/**
 * The models the backend serves, with filters; a card opens a chart with that
 * model. A workshop participant goes to their workshop instead.
 */
export default async function ModelsPage() {
    const user = await getSessionUser();
    await redirectWorkshopParticipant(user);

    // A real (non-anonymous) sign-in is required to deploy cold models. When
    // absent, ModelsSection renders cold models as gated and inert.
    const isSignedIn =
        process.env.NEXT_PUBLIC_DISABLE_AUTH === "true" || (!!user && !user.is_anonymous);

    return (
        <div className="flex size-full min-h-0 flex-col">
            <ModelsPageHeader />
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
                <ModelsSection isSignedIn={isSignedIn} />
            </div>
        </div>
    );
}
