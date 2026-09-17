'use client';

import { useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

function signature(channels) {
  return JSON.stringify(
    (channels || []).map((channel) => ({
      id: channel.id,
      name: channel.name,
      category: channel.category,
      description: channel.description,
      icon: channel.icon,
      sort_order: channel.sort_order,
      is_active: channel.is_active,
      guest_access: channel.guest_access,
      is_waiting_room: channel.is_waiting_room,
    })),
  );
}

export default function ChannelSync() {
  useEffect(() => {
    if (window.location.pathname !== '/servidor') return undefined;

    let cancelled = false;
    let lastSignature = null;

    async function checkChannels() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;

        const headers = session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {};
        const response = await fetch('/api/channels', {
          headers,
          cache: 'no-store',
        });
        if (!response.ok) return;

        const json = await response.json();
        const nextSignature = signature(json.channels);

        if (lastSignature === null) {
          lastSignature = nextSignature;
          return;
        }

        if (nextSignature !== lastSignature) {
          window.location.reload();
          return;
        }

        lastSignature = nextSignature;
      } catch {
        // The main server UI already handles channel-loading errors.
      }
    }

    checkChannels();
    const interval = window.setInterval(checkChannels, 5000);
    const onFocus = () => checkChannels();
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return null;
}
