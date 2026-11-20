import { cookies } from "next/headers";

import { getSessionUser, redirectWorkshopParticipant } from "@/lib/auth/user";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { LandingComposer } from "@/components/LandingComposer";
import { LandingPage } from "@/components/LandingPage";
import { ANNOUNCEMENT_COOKIE, readAnnouncementDismissed } from "@/lib/announcement";
import { PageHeader } from "./components/shell/PageHeader";

export const dynamic = "force-dynamic";

/**
 * `/`. Without a session it's the landing page, which the shell shows without
 * its chrome (`AppShell`). With one it's Home, also where sign-in lands: the
 * landing page's composer, which starts a chart from a prompt, a tool and a
 * model, on the landing page's background. A workshop participant goes to
 * their workshop instead. Both lead with the announcement until it's dismissed.
 */
export default async function RootPage() {
    const [cookieStore, user] = await Promise.all([cookies(), getSessionUser()]);
    const announcement = !readAnnouncementDismissed(cookieStore.get(ANNOUNCEMENT_COOKIE)?.value);
    if (!user) return <LandingPage announcement={announcement} />;
    await redirectWorkshopParticipant(user);

    return (
        <div className="aurora-bg flex size-full min-h-0 flex-col">
            {announcement && <AnnouncementBanner />}
            <PageHeader />
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-3 md:px-6">
                <LandingComposer loggedIn />
            </div>
        </div>
    );
}
