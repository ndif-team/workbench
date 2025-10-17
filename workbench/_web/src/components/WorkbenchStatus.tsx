"use client";

import { getModels } from "@/lib/api/modelsApi";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "@/stores/useWorkspace";

export function WorkbenchStatus() {
    const { isLoading, isError } = useQuery({
        queryKey: ['models'],
        queryFn: getModels,
        refetchInterval: 120000,
    });

    const { jobStatus } = useWorkspace();

    const getStatusInfo = () => {
        if (isLoading) return { color: 'bg-yellow-500 hover:bg-yellow-600', pulse: true };
        if (isError) return { color: 'bg-destructive hover:bg-destructive', pulse: false, };
        return { color: 'bg-green-600 hover:bg-green-700', pulse: false };
    };

    const status = getStatusInfo();

    return (
        <div
            className={cn(
                "rounded h-8 px-6 flex items-center bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
                status.pulse && "animate-pulse",

            )}
        >
            <div className={cn(
                "w-2.5 h-2.5 rounded-full mr-3",
                status.color
            )} />
            {isLoading ? (
                <p className="text-sm text-muted-foreground">Connecting</p>
            ) : (
                <p className="text-sm text-muted-foreground">{jobStatus}</p>
            )}
        </div>

    );
}
