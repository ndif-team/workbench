import { notFound } from "next/navigation";
import Link from "next/link";

import { getAdminEmail } from "@/lib/auth/admin";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { UserDropdown } from "@/components/UserDropdown";

/**
 * Admin surface for tutorial content. Gated by the ADMIN_EMAILS allowlist (404
 * for non-admins so the route isn't advertised). UX only — every admin server
 * action re-runs requireAdmin() itself.
 */
export default async function AdminTutorialsLayout({ children }: { children: React.ReactNode }) {
    const adminEmail = await getAdminEmail();
    if (!adminEmail) {
        notFound();
    }

    return (
        <div className="min-h-screen px-3 md:px-6 pb-6">
            <header className="py-2 px-3 md:py-3 md:px-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Link
                        href="/workbench"
                        className="bg-gradient-to-r from-primary via-purple-600 to-primary bg-clip-text text-transparent"
                    >
                        <h1 className="text-2xl font-bold">Workbench</h1>
                    </Link>
                    <span className="text-sm text-muted-foreground">/ Tutorials</span>
                </div>
                <nav className="flex gap-1 md:gap-3 items-center">
                    <Link
                        href="/admin/workshops"
                        className="text-sm text-muted-foreground hover:text-foreground"
                    >
                        Workshops
                    </Link>
                    <ModeToggle />
                    <UserDropdown />
                </nav>
            </header>
            <main className="mx-auto w-full max-w-3xl">{children}</main>
        </div>
    );
}
