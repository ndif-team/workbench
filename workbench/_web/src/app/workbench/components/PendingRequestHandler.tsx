"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getPendingRequest } from "@/app/login/page";

/**
 * Client-side component that checks for pending requests stored in localStorage
 * after OAuth authentication and redirects to workbench with the proper params.
 */
export function PendingRequestHandler() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        // Only check once and only if we don't already have prompt/model in URL
        if (checked) return;

        const existingPrompt = searchParams.get("prompt");
        const existingModel = searchParams.get("model");

        // If we already have params in URL, don't override
        if (existingPrompt && existingModel) {
            setChecked(true);
            return;
        }

        // Check for pending request in localStorage
        const pendingRequest = getPendingRequest();

        if (pendingRequest) {
            // Redirect to workbench with the pending request params
            const params = new URLSearchParams({
                prompt: pendingRequest.prompt,
                model: pendingRequest.model,
                createNew: "true",
            });
            router.replace(`/workbench?${params.toString()}`);
        }

        setChecked(true);
    }, [checked, router, searchParams]);

    // This component doesn't render anything visible
    return null;
}
