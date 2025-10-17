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
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "./ui/button"
import { createClient } from "@/lib/supabase/client"
import { usePostHog } from 'posthog-js/react';

type CurrentUser = SupabaseUser & { is_anonymous?: boolean | null }

export function UserDropdown() {
    const router = useRouter();
    // const posthog = usePostHog();
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
            // if (posthog) {
            //     posthog.reset(true);
            // }
            router.push("/");
            router.refresh();
        }
    };

    const handleLogin = () => {
        router.push("/login");
    };

    // Show login button for guests/anonymous users
    const isGuest = currentUser?.is_anonymous || !currentUser?.email;

    if (isGuest) {
        return (
            <Link href="/login">
                <Button variant="outline" 
                    size="default" 
                    className="text-foreground hover:text-white border-0 transition-colors"
                    style={{
                        background: 'transparent',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(to right, rgb(59, 130, 246), rgb(168, 85, 247))';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                    }}>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                    Log In
                </Button>
            </Link>
        );
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="bg-transparent hover:!white/10 border-0">
                    <User size={14} />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
                <div className="flex flex-col border-b py-2.5 px-1">   
                    <span className="px-1 text-sm font-semibold">Account</span>
                    <span className="px-1 text-sm">{currentUser?.email}</span>
                </div>
                <DropdownMenuItem disabled={isLoggingOut} onClick={handleLogout}>
                    {isLoggingOut ? "Logging out..." : "Logout"}
                </DropdownMenuItem>

            </DropdownMenuContent>
        </DropdownMenu>
    )
}
