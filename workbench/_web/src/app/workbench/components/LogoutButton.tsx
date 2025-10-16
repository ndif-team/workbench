"use client";

import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { getSupabaseClient, resetSupabaseClient } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    const supabase = getSupabaseClient();

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Logout error:", error);
      setIsLoggingOut(false);
    } else {
      // Reset the client after logout to clear any cached user data
      resetSupabaseClient();
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
      className="gap-3"
    >
      <LogOut className="h-4 w-4" />
      {isLoggingOut ? "Logging out..." : "Logout"}
    </Button>
  );
}
