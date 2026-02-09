"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getWorkspaceById } from "@/lib/queries/workspaceQueries";
import { useUpdateWorkspaceName } from "@/lib/api/workspaceApi";
import { queryKeys } from "@/lib/queryKeys";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";

export function WorkspaceNameEditor() {
    const { workspaceId } = useParams<{ workspaceId: string }>();
    const [localName, setLocalName] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Get user ID
    useEffect(() => {
        const getUser = async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            setUserId(user?.id ?? null);
        };
        getUser();
    }, []);

    // Fetch workspace data
    const { data: workspace, isLoading } = useQuery({
        queryKey: queryKeys.workspaces.workspace(workspaceId),
        queryFn: () => getWorkspaceById(workspaceId),
        enabled: !!workspaceId,
    });

    const { mutate: updateName } = useUpdateWorkspaceName();

    // Reset local name when workspace changes
    useEffect(() => {
        setLocalName(null);
        setIsEditing(false);
    }, [workspaceId]);

    // The display name: use localName while editing, otherwise use workspace name
    const displayName = localName !== null ? localName : (workspace?.name || "");

    // Save name (debounced)
    const saveName = useCallback((newName: string) => {
        if (!workspaceId || !userId) return;
        
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(() => {
            if (newName.trim()) {
                updateName({ workspaceId, name: newName.trim(), userId });
            }
        }, 500);
    }, [workspaceId, userId, updateName]);

    // Handle name change
    const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newName = e.target.value;
        setLocalName(newName);
        saveName(newName);
    }, [saveName]);

    // Handle blur - exit editing mode
    const handleBlur = useCallback(() => {
        setIsEditing(false);
    }, []);

    // Handle click to start editing
    const handleClick = useCallback(() => {
        setLocalName(displayName);
        setIsEditing(true);
        setTimeout(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        }, 0);
    }, [displayName]);

    // Handle keyboard
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === "Escape") {
            e.currentTarget.blur();
        }
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-10">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!workspace) {
        return null;
    }

    const titleClass = "text-xl font-medium text-foreground";

    if (isEditing) {
        return (
            <input
                ref={inputRef}
                type="text"
                value={displayName}
                onChange={handleNameChange}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                placeholder="Untitled Workspace"
                className={`${titleClass} bg-transparent border-none outline-none focus:ring-0 text-center placeholder:text-muted-foreground/50`}
            />
        );
    }

    return (
        <h1
            onClick={handleClick}
            className={`${titleClass} cursor-text hover:bg-accent/30 rounded px-2 -mx-2 py-1 transition-colors`}
        >
            {displayName || "Untitled Workspace"}
        </h1>
    );
}
