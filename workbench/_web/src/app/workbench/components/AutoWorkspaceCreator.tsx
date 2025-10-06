"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createWorkspace } from "@/lib/queries/workspaceQueries";

interface AutoWorkspaceCreatorProps {
    userId: string;
    initialPrompt?: string;
    initialModel?: string;
}

export function AutoWorkspaceCreator({ userId, initialPrompt, initialModel }: AutoWorkspaceCreatorProps) {
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        const createAndRedirect = async () => {
            if (isCreating) return; // Prevent double execution
            
            setIsCreating(true);
            setError(null);

            try {
                console.log("Creating default workspace for user:", userId);
                const newWorkspace = await createWorkspace(userId, "Default Workspace");
                console.log("Created workspace:", newWorkspace);
                
                // Small delay to ensure the workspace is fully created
                setTimeout(() => {
                    // If we have a prompt from the landing page, pass it along
                    if (initialPrompt) {
                        const params = new URLSearchParams({ prompt: initialPrompt });
                        if (initialModel) {
                            params.set('model', initialModel);
                        }
                        router.push(`/workbench/${newWorkspace.id}?${params.toString()}`);
                    } else {
                        router.push(`/workbench/${newWorkspace.id}`);
                    }
                }, 500);
                
            } catch (err) {
                console.error("Failed to create workspace:", err);
                setError(err instanceof Error ? err.message : "Failed to create workspace");
                setIsCreating(false);
            }
        };

        createAndRedirect();
    }, [userId, router, isCreating, initialPrompt, initialModel]);

    if (error) {
        return (
            <div className="p-4 border rounded bg-red-50 border-red-200">
                <h2 className="text-lg font-semibold mb-2 text-red-700">Error Creating Workspace</h2>
                <p className="mb-4 text-red-600">{error}</p>
                <button 
                    onClick={() => {
                        setError(null);
                        setIsCreating(false);
                    }}
                    className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                >
                    Try Again
                </button>
            </div>
        );
    }

    return (
        <div className="p-4 border rounded bg-blue-50 border-blue-200">
            <h2 className="text-lg font-semibold mb-2">Setting up your workspace...</h2>
            <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                <p className="text-gray-600">Creating your default workspace and redirecting...</p>
            </div>
        </div>
    );
}
