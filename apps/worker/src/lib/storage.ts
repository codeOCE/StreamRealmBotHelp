import type { SupabaseClient } from '@supabase/supabase-js';

/** Public Supabase Storage bucket holding bingo tile images + custom fonts. */
export const ASSET_BUCKET = 'bingo-assets';

/**
 * Upload a file/blob to a public bucket and return its public URL (or null on
 * failure). The Worker uses the service-role client, so storage RLS is bypassed.
 */
export async function uploadPublic(
  supabase: SupabaseClient,
  path: string,
  data: Blob,
  contentType: string,
): Promise<string | null> {
  const { error } = await supabase.storage.from(ASSET_BUCKET).upload(path, data, { contentType, upsert: true });
  if (error) {
    console.error('[storage] upload failed:', error.message);
    return null;
  }
  return supabase.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Best-effort delete of a stored object. */
export async function removeObject(supabase: SupabaseClient, path: string): Promise<void> {
  await supabase.storage.from(ASSET_BUCKET).remove([path]).catch(() => undefined);
}

/** Safe lowercase file extension (defaults to `fallback`). */
export function safeExt(filename: string, fallback: string): string {
  const ext = (filename.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ext || fallback;
}
