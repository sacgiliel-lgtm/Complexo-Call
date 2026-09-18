'use client';

import { createClient } from '@supabase/supabase-js';

let browserClient;

export function getSupabaseClient() {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Supabase browser credentials are not configured.');
  }

  browserClient = createClient(url, anonKey);
  return browserClient;
}

export const supabase = getSupabaseClient();
