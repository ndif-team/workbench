import { createClient } from "@/lib/supabase/server";
import { ModelsSection } from "@/components/models/ModelsSection";
import { hasWorkshopClaim } from "@/lib/workshop";
import { ModelsPageHeader } from "./components/ModelsPageHeader";

export const dynamic = "force-dynamic";

/** The models the backend serves, with filters; a card opens a chart with that model. */
export default async function ModelsPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // A real (non-anonymous) sign-in is required to deploy cold models. When
    // absent, ModelsSection renders cold models as gated and inert. Anonymous
    // workshop participants count as signed in — their claim unlocks gated models.
    const isSignedIn =
        process.env.NEXT_PUBLIC_DISABLE_AUTH === "true" ||
        (!!user && !user.is_anonymous) ||
        hasWorkshopClaim(user);

    return (
        <div className="flex size-full min-h-0 flex-col">
            <ModelsPageHeader />
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
                <ModelsSection isSignedIn={isSignedIn} />
            </div>
        </div>
    );
}
