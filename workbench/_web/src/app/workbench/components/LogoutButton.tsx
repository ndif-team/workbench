"use client";

import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
    const router = useRouter();
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    if (process.env.NEXT_PUBLIC_E2E === "true") {
        return null;
    }

    const handleLogout = async () => {
        setIsLoggingOut(true);
        const supabase = createClient();
        
        const { error } = await supabase.auth.signOut();
        
        if (error) {
            console.error("Logout error:", error);
            setIsLoggingOut(false);
        } else {
            router.push("/login");
            router.refresh();
        }
    };

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="gap-2"
        >
            <LogOut className="h-4 w-4" />
            {isLoggingOut ? "Logging out..." : "Logout"}
        </Button>
    );
}