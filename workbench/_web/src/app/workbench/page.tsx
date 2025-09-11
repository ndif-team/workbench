import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { ModelsDisplay } from "@/app/workbench/components/ModelsDisplay";
import { WorkspaceList } from "@/app/workbench/components/WorkspaceList";
import { getWorkspaces, createWorkspace } from "@/lib/queries/workspaceQueries";
import { AutoWorkspaceCreator } from "@/app/workbench/components/AutoWorkspaceCreator";

import { redirect } from "next/navigation";
export const dynamic = 'force-dynamic'

export default async function WorkbenchPage() {
    const supabase = await createClient();
    
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
        redirect("/login");
    }

    const displayName = (user as User)?.is_anonymous || !user.email ? "Guest" : user.email

    // Check if user has any workspaces
    const workspaces = await getWorkspaces(user.id);
    
    // If no workspaces exist, we'll show the page with a message and option to create
    const shouldCreateWorkspace = !workspaces || workspaces.length === 0;

    return (
        <>
            <div className="p-6">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold">Workbench</h1>
                    <p className="text-sm text-muted-foreground">
                        Logged in as: {displayName} (ID: {user.id})
                    </p>
                </div>
                
                <ModelsDisplay />
                
                {shouldCreateWorkspace ? (
                    <AutoWorkspaceCreator userId={user.id} />
                ) : (
                    <WorkspaceList userId={user.id} />
                )}
            </div>
        </>
    );
}