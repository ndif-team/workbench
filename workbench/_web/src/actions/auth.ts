"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Server action to get the current user's email using server-side Supabase client
 * This can access HTTP-only cookies and is more secure than client-side auth
 */
export async function getCurrentUserEmailAction(): Promise<string | null> {
    try {
        const supabase = await createClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error) {
            console.log("Server: Auth error:", error.message);
            return null;
        }
        
        if (!user || user.email === "") {
            return "guest@localhost";
        }

        return user.email;
    } catch (error) {
        console.warn("Server: Failed to get user email:", error);
        return null;
    }
}

/**
 * Server action to create headers with user email
 * Returns headers object that can be used in API calls
 */
export async function createUserHeadersAction(): Promise<Record<string, string>> {
    const userEmail = await getCurrentUserEmailAction();
    
    if (!userEmail) {
        return {};
    }
    
    return {
        "X-User-Email": userEmail
    };
}
