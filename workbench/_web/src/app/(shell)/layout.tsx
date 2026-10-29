import type React from "react";
import { cookies } from "next/headers";

import { WorkspaceScopeHost } from "@/components/providers/WorkspaceScopeProvider";
import { PendingRequestHandler } from "./components/PendingRequestHandler";
import { AppShell } from "./components/shell/AppShell";
import { SIDEBAR_COLLAPSED_COOKIE } from "./components/shell/sidebarCookie";

/**
 * The app shell around the chart, report, workspace and models pages: the
 * global sidebar beside the page, persisting across navigation. Shell chrome
 * reads the current item's workspace through `WorkspaceScopeHost`. Keep
 * `PendingRequestHandler` mounted here: it resumes a chart launch that waited
 * on sign-in, wherever sign-in lands.
 */
export default async function ShellLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const collapsed = (await cookies()).get(SIDEBAR_COLLAPSED_COOKIE)?.value === "true";
    return (
        <WorkspaceScopeHost>
            <PendingRequestHandler />
            <AppShell defaultCollapsed={collapsed}>{children}</AppShell>
        </WorkspaceScopeHost>
    );
}
