import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  // If local return a mock client
  if (process.env.NEXT_PUBLIC_DISABLE_AUTH === "true") {
    return {
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: "local-dev-user",
              email: "dev@localhost",
              app_metadata: {},
              user_metadata: {},
              aud: "authenticated",
              created_at: new Date().toISOString(),
            },
          },
          error: null,
        }),
        signOut: async () => ({ error: null }),
      },
      // Pass through other methods as needed
      from: () => ({}),
      storage: {
        from: () => ({}),
      },
    } as any;
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  );
}
