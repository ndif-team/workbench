import { signInWithMagicLinkAction } from "@/actions/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "./SubmitButton";

export const dynamic = "force-dynamic";

/**
 * Magic-link sign-in. Supabase's admin `generateLink` produces a single-use
 * `token_hash`; this page surfaces a button that posts it to
 * `signInWithMagicLinkAction`, which verifies the OTP and sets the session
 * cookies. The button-gated two-step keeps link/email prefetchers from
 * consuming the token before the user clicks.
 */
export default async function MagicLinkPage(props: {
    searchParams: Promise<{ token_hash?: string; error?: string }>;
}) {
    const { token_hash, error } = await props.searchParams;

    return (
        <div className="flex items-center justify-center min-h-screen p-4 bg-gradient-to-tr from-background dark:to-primary/15 to-primary/30">
            <div className="w-full max-w-md">
                <Card>
                    <CardHeader>
                        <CardTitle>Sign in by link</CardTitle>
                        <CardDescription>
                            Click below to finish signing in to the workbench.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form action={signInWithMagicLinkAction} className="flex flex-col gap-4">
                            <input type="hidden" name="token_hash" value={token_hash ?? ""} />
                            {error && (
                                <p role="alert" className="text-sm text-destructive">
                                    {error}
                                </p>
                            )}
                            <SubmitButton disabled={!token_hash} />
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
