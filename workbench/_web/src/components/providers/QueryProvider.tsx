"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { ErrorTracking } from "@/lib/errorTracking";

/** `meta` on a mutation. `reportedAs: "run"` marks a tool run, whose failure is the `run_failed` event rather than an exception. */
interface MutationMeta extends Record<string, unknown> {
    reportedAs?: "run";
}

declare module "@tanstack/react-query" {
    interface Register {
        mutationMeta: MutationMeta;
    }
}

interface QueryProviderProps {
    children: ReactNode;
}

/**
 * The app's React Query client. Failed mutations are reported to error
 * tracking (except runs, see `MutationMeta`), and so are failed queries, but
 * only once retries are spent and only while the query has no data: a
 * background refetch that fails leaves the last data on screen, and would
 * repeat on every window focus while a backend is down.
 */
export function QueryProvider({ children }: QueryProviderProps) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                queryCache: new QueryCache({
                    onError: (error, query) => {
                        if (query.state.data !== undefined) return;
                        ErrorTracking.capture(error, {
                            source: "query",
                            query: ErrorTracking.keyLabel(query.queryKey),
                        });
                    },
                }),
                mutationCache: new MutationCache({
                    onError: (error, _variables, _context, mutation) => {
                        if (mutation.meta?.reportedAs === "run") return;
                        ErrorTracking.capture(error, {
                            source: "mutation",
                            mutation: ErrorTracking.keyLabel(mutation.options.mutationKey),
                        });
                    },
                }),
                defaultOptions: {
                    queries: {
                        staleTime: 5 * 60 * 1000, // 5 minutes
                        retry: 1,
                    },
                },
            }),
    );

    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
