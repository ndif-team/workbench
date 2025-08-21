"use client"

import * as React from "react"
import { useEffect, useState } from "react"
import { User } from "lucide-react"
import type { User as SupabaseUser } from "@supabase/supabase-js"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useRouter } from "next/navigation"
import { Button } from "./ui/button"
import { createClient } from "@/lib/supabase/client"

type CurrentUser = SupabaseUser & { is_anonymous?: boolean | null }

export function UserDropdown() {
    const router = useRouter();
    const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    useEffect(() => {
        const fetchUser = async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            setCurrentUser(user);
        };
        
        fetchUser();
    }, []);

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
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                    <User size={14} />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
                <div className="flex flex-col border-b py-2.5 px-1">   
                    <span className="px-1 text-sm font-semibold">Account</span>
                    <span className="px-1 text-sm">{(currentUser?.is_anonymous || !currentUser?.email) ? "Guest" : currentUser?.email}</span>
                </div>
                <DropdownMenuItem disabled={isLoggingOut} onClick={handleLogout}>
                    {isLoggingOut ? "Logging out..." : "Logout"}
                </DropdownMenuItem>

            </DropdownMenuContent>
        </DropdownMenu>
    )
}
