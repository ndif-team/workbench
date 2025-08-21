import { createClient } from "@/lib/supabase/server";
import { ModelsDisplay } from "@/app/workbench/components/ModelsDisplay";
import { WorkspaceList } from "@/app/workbench/components/WorkspaceList";
import { LogoutButton } from "@/app/workbench/components/LogoutButton";
import { redirect } from "next/navigation";
export const dynamic = 'force-dynamic'

export default async function WorkbenchPage() {
    const supabase = await createClient();
    
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
        redirect("/login");
    }

    const displayName = (user as any)?.is_anonymous || !user.email ? "Guest" : user.email

    return (
        <>
            <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold">Workbench</h1>
                        <p className="text-sm text-muted-foreground">
                            Logged in as: {displayName} (ID: {user.id})
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