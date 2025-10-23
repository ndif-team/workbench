import { LandingPage } from "@/components/LandingPage";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Page() {
    if (process.env.NEXT_PUBLIC_DISABLE_AUTH === "true") {
        redirect("/workbench");
    }

    // Check if user is already logged in
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    return <LandingPage loggedIn={!!user} />;
}
