import type React from "react";
import { cookies } from "next/headers";

import { WorkspaceScopeHost } from "@/components/providers/WorkspaceScopeProvider";
import { getSessionUser, getWorkshopParticipant } from "@/lib/auth/user";
import { PendingRequestHandler } from "./components/PendingRequestHandler";
import { AppShell } from "./components/shell/AppShell";
import {
    SIDEBAR_COLLAPSED_COOKIE,
    SIDEBAR_WIDTH_COOKIE,
    readSidebarWidth,
} from "./components/shell/sidebarCookie";

/**
 * The app shell around the chart, report, workspace and models pages: the
 * global sidebar beside the page, persisting across navigation. Shell chrome
 * reads the current item's workspace through `WorkspaceScopeHost`. An
 * anonymous workshop participant's shell is their workshop's (see
 * `getWorkshopParticipant`). Keep `PendingRequestHandler` mounted here: it
 * resumes a chart launch that waited on sign-in, wherever sign-in lands.
 */
export default async function ShellLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const [cookieStore, user] = await Promise.all([cookies(), getSessionUser()]);
    const collapsed = cookieStore.get(SIDEBAR_COLLAPSED_COOKIE)?.value === "true";
    const width = readSidebarWidth(cookieStore.get(SIDEBAR_WIDTH_COOKIE)?.value);
    const workshopParticipant = await getWorkshopParticipant(user);
    return (
        <WorkspaceScopeHost>
            <PendingRequestHandler />
            <AppShell
                defaultCollapsed={collapsed}
                defaultWidth={width}
                workshopParticipant={workshopParticipant}
            >
                {children}
            </AppShell>
        </WorkspaceScopeHost>
    );
}
