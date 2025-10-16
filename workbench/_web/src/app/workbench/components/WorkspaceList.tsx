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
    queryFn: () => getWorkspaces(userId),
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
      <div className="flex justify-end mb-6">
        <CreateWorkspaceDialog userId={userId} />
      </div>

      {!workspaces || workspaces.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground mb-4">No workspaces found</p>
          <p className="text-sm text-muted-foreground/70">Create a new workspace to get started</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {workspaces.map((workspace) => {
            return (
              <Link
                key={workspace.id}
                href={`/workbench/${workspace.id}`}
                className="block p-4 border rounded hover:bg-muted/50 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-lg">{workspace.name}</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      {workspace.public && (
                        <span className="inline-block px-3 py-2 bg-green-100 text-green-800 text-xs rounded-full mb-1">
                          Public
                        </span>
                      )}
                      <p className="text-xs text-muted-foreground">{workspace.id}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleDeleteWorkspace(e, workspace.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
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
