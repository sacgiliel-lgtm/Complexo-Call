'use client';

import { createClient } from '@supabase/supabase-js';

const globalScope = globalThis;

export function getSupabaseClient() {
  if (globalScope.__cpxSupabaseClient) {
    return globalScope.__cpxSupabaseClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Supabase browser credentials are not configured.');
  }

  globalScope.__cpxSupabaseClient = createClient(url, anonKey);
  return globalScope.__cpxSupabaseClient;
}

export const supabase = getSupabaseClient();
