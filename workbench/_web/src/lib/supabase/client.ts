import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export const THUMBNAIL_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_THUMBNAIL_BUCKET || 'thumbnails';

export function getThumbnailPath(workspaceId: string, chartId: string) {
  // shard by workspace for easier browsing, day-level partition for cache busting optional later
  return `${workspaceId}/${chartId}.png`;
}

export async function uploadThumbnailPublic(blob: Blob, path: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(THUMBNAIL_BUCKET).upload(path, blob, {
    cacheControl: '31536000',
    upsert: true,
    contentType: 'image/png',
  });
  if (error) throw error;
  const { data: publicUrl } = supabase.storage.from(THUMBNAIL_BUCKET).getPublicUrl(path);
  return publicUrl.publicUrl;
}