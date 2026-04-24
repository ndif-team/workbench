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
        // Only check once and only if we don't already have tool context in URL
        if (checked) return;

        const existingModel = searchParams.get("model");
        const existingPrompt = searchParams.get("prompt");
        const existingSrcPrompt = searchParams.get("srcPrompt");

        // If the URL already carries tool context, don't override
        if (existingModel && (existingPrompt || existingSrcPrompt)) {
            setChecked(true);
            return;
        }

        // Check for pending request in localStorage
        const pendingRequest = getPendingRequest();

        if (pendingRequest) {
            const params = new URLSearchParams({
                model: pendingRequest.model,
                createNew: "true",
            });
            if (pendingRequest.tool) params.set("tool", pendingRequest.tool);
            if (pendingRequest.prompt) params.set("prompt", pendingRequest.prompt);
            if (pendingRequest.srcPrompt) params.set("srcPrompt", pendingRequest.srcPrompt);
            if (pendingRequest.tgtPrompt) params.set("tgtPrompt", pendingRequest.tgtPrompt);
            if (pendingRequest.srcPos) params.set("srcPos", pendingRequest.srcPos);
            if (pendingRequest.tgtPos) params.set("tgtPos", pendingRequest.tgtPos);
            if (pendingRequest.tgtFreeze) params.set("tgtFreeze", pendingRequest.tgtFreeze);
            router.replace(`/workbench?${params.toString()}`);
        }

        setChecked(true);
    }, [checked, router, searchParams]);

    // This component doesn't render anything visible
    return null;
}
