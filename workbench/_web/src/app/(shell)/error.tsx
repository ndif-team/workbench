"use client"; // Error boundaries must be Client Components

import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { captureError } from "@/lib/errorTracking";
import { PageHeader } from "./components/shell/PageHeader";

/**
 * A shell page that throws is replaced by this, beside the sidebar, rather
 * than the whole document going to `global-error`. Try again refetches the
 * page's server components before re-rendering it, since `reset` alone
 * re-renders the payload that failed.
 */
export default function ShellError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const router = useRouter();

    useEffect(() => {
        captureError(error, { source: "error_boundary", boundary: "shell", digest: error.digest });
    }, [error]);

    const retry = () =>
        startTransition(() => {
            router.refresh();
            reset();
        });

    return (
        <div className="flex size-full min-h-0 flex-col">
            <PageHeader />
            <div className="flex flex-1 items-center justify-center p-4" role="alert">
                <div className="flex flex-col items-center gap-3 text-center">
                    <p className="text-sm text-muted-foreground">Something went wrong.</p>
                    <Button type="button" variant="outline" size="sm" onClick={retry}>
                        Try again
                    </Button>
                </div>
            </div>
        </div>
    );
}
