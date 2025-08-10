"use client";

import { getWorkspaces } from "@/lib/queries/workspaceQueries";
import Link from "next/link";
import { CreateWorkspaceDialog } from "@/components/CreateWorkspaceDialog";
import { useQuery } from "@tanstack/react-query";
import { useDeleteWorkspace } from "@/lib/api/workspaceApi";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

interface WorkspaceListProps {
    userId: string;
}

export function WorkspaceList({ userId }: WorkspaceListProps) {
    const deleteWorkspaceMutation = useDeleteWorkspace();

    const { data: workspaces, isLoading } = useQuery({
        queryKey: ["workspaces"],
        queryFn: async () => {
            if (process.env.NEXT_PUBLIC_E2E === "true") {
                return [
                    { id: "ws-e2e-1", name: "E2E Workspace", userId, public: false },
                ];
            }
            return getWorkspaces(userId);
        },
    });

    const handleDeleteWorkspace = (e: React.MouseEvent, workspaceId: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this workspace?")) {
            deleteWorkspaceMutation.mutate({ userId, workspaceId });
        }
    };

    if (isLoading) {
        return (
            <div className="text-center py-8">
                <p className="text-muted-foreground">Loading workspaces...</p>
            </div>
        );
    }

    return (
        <>
            <div className="flex justify-end mb-6" data-testid="workspaces-header">
                <CreateWorkspaceDialog userId={userId} />
            </div>
            
            {!workspaces || workspaces.length === 0 ? (
                <div className="text-center py-8" data-testid="workspaces-empty-state">
                    <p className="text-muted-foreground mb-4">No workspaces found</p>
                    <p className="text-sm text-muted-foreground/70">Create a new workspace to get started</p>
                </div>
            ) : (
                <div className="grid gap-4" data-testid="workspaces-list">
                    {workspaces.map((workspace) => {
                        return (
                            <Link
                                key={workspace.id}
                                href={`/workbench/${workspace.id}/lens`}
                                className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                                data-testid={`workspace-item-${workspace.id}`}
                                aria-label={`Open workspace ${workspace.name}`}
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-semibold text-lg">{workspace.name}</h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="text-right">
                                            {workspace.public && (
                                                <span className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full mb-1">
                                                    Public
                                                </span>
                                            )}
                                            <p className="text-xs text-muted-foreground">
                                                {workspace.id}
                                            </p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) => handleDeleteWorkspace(e, workspace.id)}
                                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                            aria-label={`Delete workspace ${workspace.name}`}
                                            data-testid={`workspace-delete-${workspace.id}`}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </>
    );
}