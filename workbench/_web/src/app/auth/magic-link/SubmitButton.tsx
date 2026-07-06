"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/**
 * Submit button for the magic-link form. Split into a client component so it can
 * reflect the form's pending state via useFormStatus while the page itself stays
 * a server component.
 */
export function SubmitButton({ disabled }: { disabled?: boolean }) {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" name="action" className="w-full" disabled={disabled || pending}>
            {pending ? "Signing in…" : "Sign in with magic link"}
        </Button>
    );
}
