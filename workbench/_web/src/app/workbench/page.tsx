"use server";

import { createClient } from "@/lib/supabase/server";
import { ModelsDisplay } from "@/app/workbench/components/ModelsDisplay";
import { WorkspaceList } from "@/app/workbench/components/WorkspaceList";
import { LogoutButton } from "@/app/workbench/components/LogoutButton";
import { redirect } from "next/navigation";

export default async function WorkbenchPage() {
    // E2E mode: bypass Supabase auth entirely
    if (process.env.NEXT_PUBLIC_E2E === "true") {
        const user = { id: "e2e-user", email: "e2e@example.com" } as const;
        return (
            <>
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h1 className="text-2xl font-bold">Workbench</h1>
                            <p className="text-sm text-muted-foreground">
                                Logged in as: {user.email} (ID: {user.id})
                            </p>
                        </div>
                        <LogoutButton />
                    </div>
                    <ModelsDisplay />
                    <WorkspaceList userId={user.id} />
                </div>
            </>
        );
    }

    const supabase = await createClient();

    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    if (error || !user) {
        redirect("/login");
    }

    return (
        <>
            <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold">Workbench</h1>
                        <p className="text-sm text-muted-foreground">
                            Logged in as: {user.email} (ID: {user.id})
                        </p>
                    </div>
                    <LogoutButton />
                </div>

                <ModelsDisplay />

                <WorkspaceList userId={user.id} />
            </div>
        </>
    );
}