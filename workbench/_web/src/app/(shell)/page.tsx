import { getSessionUser, redirectWorkshopParticipant } from "@/lib/auth/user";
import { LandingComposer } from "@/components/LandingComposer";
import { LandingPage } from "@/components/LandingPage";
import { PageHeader } from "./components/shell/PageHeader";

export const dynamic = "force-dynamic";

/**
 * `/`. Without a session it's the landing page, which the shell shows without
 * its chrome (`AppShell`). With one it's Home, also where sign-in lands: the
 * landing page's composer, which starts a chart from a prompt, a tool and a
 * model, on the landing page's background. A workshop participant goes to
 * their workshop instead.
 */
export default async function RootPage() {
    const user = await getSessionUser();
    if (!user) return <LandingPage />;
    await redirectWorkshopParticipant(user);

    return (
        <div className="aurora-bg flex size-full min-h-0 flex-col">
            <PageHeader />
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-3 md:px-6">
                <LandingComposer loggedIn />
            </div>
        </div>
    );
}
