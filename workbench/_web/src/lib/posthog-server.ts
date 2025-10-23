import { PostHog } from "posthog-node";

let posthogInstance: PostHog | null = null;

export function getPostHogServer() {
  // Don't initialize PostHog in development or if no key is provided
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
  // const isDev = process.env.NODE_ENV === 'development'
  
  if (!posthogKey) {
    return null
  }
  
  if (!posthogInstance) {
    posthogInstance = new PostHog(
      posthogKey,
      {
        host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        flushAt: 1,
        flushInterval: 0,
      }
    )
  }

  return posthogInstance;
}
