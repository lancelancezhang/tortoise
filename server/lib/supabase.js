import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase = url && serviceRoleKey
  ? createClient(url, serviceRoleKey, { auth: { persistSession: false } })
  : null;

export function isSupabaseConfigured() {
  return !!supabase;
}

/** Resolve family slug to family id. Returns null if not found or Supabase not configured. */
export async function getFamilyIdBySlug(slug) {
  if (!supabase || !slug) return null;
  const { data, error } = await supabase
    .from('families')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (error || !data) return null;
  return data.id;
}
