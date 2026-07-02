import { notFound } from "next/navigation";
import Link from "next/link";

import { getAdminEmail } from "@/lib/auth/admin";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { UserDropdown } from "@/components/UserDropdown";

/**
 * Admin surface for workshop configs. Gated by the ADMIN_EMAILS allowlist:
 * non-admins get a 404 (rather than a redirect) so the route's existence isn't
 * advertised. This check is UX only — every admin server action re-runs
 * requireAdmin() itself.
 */
export default async function AdminWorkshopsLayout({ children }: { children: React.ReactNode }) {
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
                    <span className="text-sm text-muted-foreground">/ Workshops</span>
                </div>
                <nav className="flex gap-1 md:gap-3 items-center">
                    <ModeToggle />
                    <UserDropdown />
                </nav>
            </header>
            <main className="mx-auto w-full max-w-3xl">{children}</main>
        </div>
    );
}
