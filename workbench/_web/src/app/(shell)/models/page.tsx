import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { ModelsSection } from "@/components/models/ModelsSection";
import { hasWorkshopClaim } from "@/lib/workshop";
import { ModelsSectionStateController } from "./components/ModelsSectionStateController";

export const dynamic = "force-dynamic";

/** Models page. Temporary: the models grid as it was on the old workspace list. */
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
        <div className="size-full overflow-auto px-3 md:px-6 pb-6">
            <Suspense fallback={null}>
                <ModelsSectionStateController />
            </Suspense>
            <ModelsSection isSignedIn={isSignedIn} />
        </div>
    );
}
