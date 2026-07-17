"use client";

import { getWorkspaces } from "@/lib/queries/workspaceQueries";
import Link from "next/link";
import { CreateWorkspaceDialog } from "@/components/CreateWorkspaceDialog";
import { useQuery } from "@tanstack/react-query";
import { useDeleteWorkspace } from "@/lib/api/workspaceApi";
import { Button } from "@/components/ui/button";
import { Trash2, BarChart3, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useIsDark } from "@/hooks/useIsDark";
import { useModelsSection } from "@/stores/useModelsSection";

const PAGE_SIZE_EXPANDED = 8; // 2 rows × 4 cols at lg+, 4 rows × 2 cols at sm
const PAGE_SIZE_COLLAPSED = 16; // 4 rows × 4 cols at lg+ — uses the freed vertical space

interface Workspace {
    id: string;
    name: string;
    public: boolean;
    chartCount: number;
    documentCount: number;
}

function WorkspaceCard({
    workspace,
    onDelete,
}: {
    workspace: Workspace;
    onDelete: (e: React.MouseEvent, workspaceId: string) => void;
}) {
    const [isHovered, setIsHovered] = useState(false);
    const isDark = useIsDark();

    return (
        <Link
            href={`/workbench/${workspace.id}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="group block"
        >
            <div
                className="h-full px-4 py-4 rounded-lg transition-all hover:shadow-lg hover:-translate-y-1 cursor-pointer relative"
                style={{
                    border: isDark
                        ? "1px solid rgba(148, 163, 184, 0.4)"
                        : "1px solid rgba(100, 116, 139, 0.5)", // slate-400 dark, slate-500 light (darker)
                    backgroundColor: isDark ? "rgba(30, 41, 59, 0.4)" : "rgba(248, 250, 252, 0.6)", // slate tint - slate-800/slate-50
                    boxShadow: isDark
                        ? "0 2px 4px 0 rgba(0, 0, 0, 0.4)"
                        : "0 2px 4px 0 rgba(0, 0, 0, 0.06)",
                }}
            >
                <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                        <h3
                            className="text-base font-semibold break-words line-clamp-2 transition-colors leading-tight"
                            style={{
                                color: isHovered ? (isDark ? "#cbd5e1" : "#334155") : "inherit",
                            }}
                        >
                            {workspace.name}
                        </h3>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => onDelete(e, workspace.id)}
                            className="transition-all h-7 w-7 p-0 flex-shrink-0 relative z-10 hover:bg-transparent"
                            style={{
                                opacity: isHovered ? 1 : 0,
                                color: isDark ? "#ef4444" : "#dc2626", // red-500 dark, red-600 light
                                backgroundColor: "transparent",
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.color = isDark ? "#f87171" : "#b91c1c"; // red-400 dark, red-700 light
                                e.currentTarget.style.backgroundColor = "transparent";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.color = isDark ? "#ef4444" : "#dc2626";
                                e.currentTarget.style.backgroundColor = "transparent";
                            }}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>

                    {/* Charts and Reports Count */}
                    <div className="flex items-center gap-3 pt-1">
                        <div className="flex items-center gap-1.5">
                            <BarChart3
                                className="w-3.5 h-3.5"
                                style={{ color: isDark ? "#94a3b8" : "#64748b" }}
                            />
                            <span
                                className="text-xs font-light"
                                style={{ color: isDark ? "#94a3b8" : "#64748b" }}
                            >
                                {workspace.chartCount}
                            </span>
                        </div>
                        {workspace.documentCount > 0 && (
                            <div className="flex items-center gap-1.5">
                                <FileText
                                    className="w-3.5 h-3.5"
                                    style={{ color: isDark ? "#94a3b8" : "#64748b" }}
                                />
                                <span
                                    className="text-xs font-light"
                                    style={{ color: isDark ? "#94a3b8" : "#64748b" }}
                                >
                                    {workspace.documentCount}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Link>
    );
}

export function WorkspaceList() {
    const deleteWorkspaceMutation = useDeleteWorkspace();

    const { data: workspaces, isLoading } = useQuery<Workspace[]>({
        queryKey: ["workspaces"],
        queryFn: () => getWorkspaces(),
        staleTime: 0,
    });

    const modelsCollapsed = useModelsSection((s) => s.collapsed);
    const pageSize = modelsCollapsed ? PAGE_SIZE_COLLAPSED : PAGE_SIZE_EXPANDED;

    const [page, setPage] = useState(0);
    const totalPages = Math.max(1, Math.ceil((workspaces?.length ?? 0) / pageSize));

    // If a deletion (or a page-size shrink from the models section expanding)
    // leaves the current page past the end, bounce back to the last page.
    useEffect(() => {
        if (page > 0 && page >= totalPages) {
            setPage(Math.max(0, totalPages - 1));
        }
    }, [page, totalPages]);

    const pageWorkspaces = useMemo(
        () => (workspaces ?? []).slice(page * pageSize, (page + 1) * pageSize),
        [workspaces, page, pageSize],
    );

    const handleDeleteWorkspace = (e: React.MouseEvent, workspaceId: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this workspace?")) {
            deleteWorkspaceMutation.mutate({ workspaceId });
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
            <div className="flex justify-between items-center mb-6 pl-5">
                <h2 className="text-lg">Workspaces</h2>
                <CreateWorkspaceDialog />
            </div>

            {!workspaces || workspaces.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed rounded-lg">
                    <p className="text-muted-foreground mb-2 text-lg font-medium">
                        No workspaces found
                    </p>
                    <p className="text-sm text-muted-foreground/70">
                        Create a new workspace to get started
                    </p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {pageWorkspaces.map((workspace) => (
                            <WorkspaceCard
                                key={workspace.id}
                                workspace={workspace}
                                onDelete={handleDeleteWorkspace}
                            />
                        ))}
                    </div>

                    {totalPages > 1 && (
                        <div className="mt-6 flex items-center justify-center gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setPage((p) => Math.max(0, p - 1))}
                                disabled={page === 0}
                                aria-label="Previous page"
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </Button>
                            <span className="text-xs text-muted-foreground tabular-nums">
                                Page {page + 1} of {totalPages}
                            </span>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                                disabled={page >= totalPages - 1}
                                aria-label="Next page"
                            >
                                <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    )}
                </>
            )}
        </>
    );
}
