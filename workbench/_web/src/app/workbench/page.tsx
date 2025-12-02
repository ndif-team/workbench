import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { ModelsDisplay } from "@/app/workbench/components/ModelsDisplay";
import { WorkspaceList } from "@/app/workbench/components/WorkspaceList";
import { getWorkspaces, createWorkspace } from "@/lib/queries/workspaceQueries";
import { AutoWorkspaceCreator } from "@/app/workbench/components/AutoWorkspaceCreator";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { UserDropdown } from "@/components/UserDropdown";
import { WorkbenchStatus } from "@/components/WorkbenchStatus";

import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";

export default async function WorkbenchPage({
    searchParams,
}: {
    searchParams: Promise<{ prompt?: string; model?: string; tool?: string; createNew?: string }>;
}) {
    const supabase = await createClient();

    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    // Check if user has any workspaces
    const workspaces = await getWorkspaces(user.id);

    // Get the prompt, model, and tool from search params
    const params = await searchParams;
    const prompt = params?.prompt;
    const model = params?.model;
    const tool = params?.tool;
    const createNew = params?.createNew === "true";

    // If no workspaces exist OR createNew flag is set, create a new workspace
    let shouldCreateWorkspace = !workspaces || workspaces.length === 0 || createNew;

    return (
        <>
            <div className="min-h-screen px-6 pb-6 bg-gradient-to-tr from-background dark:to-primary/15 to-primary/30">
                <header className="p-3 pl-5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="bg-gradient-to-r from-primary via-purple-600 to-primary bg-clip-text text-transparent">
                            <h1 className="text-2xl font-bold">Workbench</h1>
                        </span>
                    </div>

                    <nav className="flex gap-3 items-center">
                        <WorkbenchStatus />
                        <Link href="https://forms.gle/WsxmZikeLNw34LBV9" target="_blank">
                            <Button
                                variant="ghost"
                                className="bg-transparent hover:!white/10 border-0"
                            >
                                <svg
                                    width="15"
                                    height="15"
                                    viewBox="0 0 15 15"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        d="M12.5 3L2.5 3.00002C1.67157 3.00002 1 3.6716 1 4.50002V9.50003C1 10.3285 1.67157 11 2.5 11H7.50003C7.63264 11 7.75982 11.0527 7.85358 11.1465L10 13.2929V11.5C10 11.2239 10.2239 11 10.5 11H12.5C13.3284 11 14 10.3285 14 9.50003V4.5C14 3.67157 13.3284 3 12.5 3ZM2.49999 2.00002L12.5 2C13.8807 2 15 3.11929 15 4.5V9.50003C15 10.8807 13.8807 12 12.5 12H11V14.5C11 14.7022 10.8782 14.8845 10.6913 14.9619C10.5045 15.0393 10.2894 14.9965 10.1464 14.8536L7.29292 12H2.5C1.11929 12 0 10.8807 0 9.50003V4.50002C0 3.11931 1.11928 2.00003 2.49999 2.00002Z"
                                        fill="currentColor"
                                        fillRule="evenodd"
                                        clipRule="evenodd"
                                    ></path>
                                </svg>
                                Feedback
                            </Button>
                        </Link>
                        <Button
                            variant="ghost"
                            className="bg-transparent hover:!white/10 border-0"
                            size="icon"
                            asChild
                        >
                            <Link href="https://github.com/ndif-team/workbench" target="_blank">
                                <svg className="h-4 w-4" viewBox="0 0 24 24">
                                    <path
                                        d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
                                        fill="currentColor"
                                    />
                                </svg>
                            </Link>
                        </Button>
                        <ModeToggle />
                        <UserDropdown />
                    </nav>
                </header>

                <main>
                    <ModelsDisplay />

                    {shouldCreateWorkspace ? (
                        <AutoWorkspaceCreator
                            userId={user.id}
                            initialPrompt={prompt}
                            initialModel={model}
                            initialTool={tool}
                            workspaceName={createNew ? "Untitled" : "Default Workspace"}
                            seedWithExamples={!createNew} // Don't seed with examples when creating from prompt
                        />
                    ) : (
                        <WorkspaceList userId={user.id} />
                    )}
                </main>
            </div>
        </>
    );
}
