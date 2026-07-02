"use client";

import { useCallback, useEffect, useRef, useState, type ElementRef } from "react";
import { useRouter } from "next/navigation";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { joinWorkshopAction } from "@/actions/workshop";

/**
 * Container for the join flow: calls the join action on mount and redirects
 * into the created workspace. If the Supabase project enforces captcha on
 * anonymous sign-ins, the token-less attempt comes back captchaRequired and
 * the widget is shown (mirrors the guest path on the login page).
 */
export function WorkshopJoin({ slug, workshopName }: { slug: string; workshopName: string }) {
    const [error, setError] = useState<string | null>(null);
    const [showCaptcha, setShowCaptcha] = useState(false);
    const captchaRef = useRef<ElementRef<typeof HCaptcha> | null>(null);
    const hasStartedRef = useRef(false);
    const router = useRouter();

    const join = useCallback(
        async (captchaToken?: string) => {
            setError(null);
            try {
                const result = await joinWorkshopAction(slug, captchaToken);
                if (result.ok) {
                    router.push(result.redirectTo);
                    return;
                }
                if (result.captchaRequired && process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY) {
                    setShowCaptcha(true);
                    captchaRef.current?.resetCaptcha();
                    return;
                }
                setError(result.error);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to join workshop");
            }
        },
        [slug, router],
    );

    useEffect(() => {
        if (hasStartedRef.current) return; // Prevent double execution
        hasStartedRef.current = true;
        join();
    }, [join]);

    if (error) {
        return (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
                <h2 className="mb-2 text-lg font-semibold text-destructive">
                    Could not join workshop
                </h2>
                <p className="mb-4 text-sm text-muted-foreground">{error}</p>
                <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                        setShowCaptcha(false);
                        join();
                    }}
                >
                    Try again
                </Button>
            </div>
        );
    }

    if (showCaptcha) {
        return (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-4">
                <h2 className="mb-2 text-lg font-semibold text-foreground">
                    Joining {workshopName}
                </h2>
                <p className="mb-4 text-sm text-muted-foreground">
                    Confirm you’re human to continue.
                </p>
                <HCaptcha
                    ref={captchaRef}
                    sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY as string}
                    onVerify={(token) => join(token)}
                    onError={() => setError("Captcha verification failed")}
                />
            </div>
        );
    }

    return (
        <div className="rounded-md border border-primary/20 bg-primary/5 p-4" aria-live="polite">
            <h2 className="mb-2 text-lg font-semibold text-foreground">Joining {workshopName}</h2>
            <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Setting up your workspace…</p>
            </div>
        </div>
    );
}
