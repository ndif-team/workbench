// app/providers.tsx
'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
      // Only initialize PostHog if key is provided and not in development
      const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
      
      if (posthogKey) {
        posthog.init(posthogKey, {
          api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
          person_profiles: 'identified_only',
          defaults: '2025-05-24',
        })
      }
  }, [])

  // Track Supabase auth changes and identify users in PostHog
  useEffect(() => {
    const isPostHogEnabled = posthog.__loaded
    if (!isPostHogEnabled) {
      console.log('PostHog is disabled in development')
      return
    }
    
    console.log('Tracking Supabase auth changes and identifying users in PostHog')
    const supabase = createClient()
    
    // Get initial user
    supabase.auth.getUser().then(({ data: { user } }) => {
      console.log('Initial user:', user)
      if (user?.email) {
        // Add $email so PostHog displays it properly in UI
        posthog.identify(user.email, {
          userId: user.id,
          email: user.email,
          $name: user.email,
          $email: user.email,
        })
      }
    })
    
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user
      console.log('Auth state changed:', event, user)
      console.log('PostHog identified:', posthog.get_distinct_id())
      if (user?.email) {
        // Identify user in PostHog with their email
        // Add $email so PostHog displays it properly in UI
        posthog.identify(user.email, {
          userId: user.id,
          email: user.email,
          $name: user.email,
          $email: user.email,
        })
      } else if (event === 'SIGNED_OUT') {
        // Reset PostHog identity on sign out
        posthog.reset()
      }
    })
    
    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return (
    <PHProvider client={posthog}>
      {children}
    </PHProvider>
  )
}
