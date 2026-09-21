import { RoomServiceClient } from 'livekit-server-sdk';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function noStore() {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  };
}

async function checkDatabase() {
  try {
    const admin = getSupabaseAdmin();
    const startedAt = Date.now();
    const { error } = await admin
      .from('server_settings')
      .select('id')
      .eq('id', 1)
      .maybeSingle();

    return {
      ok: !error,
      latencyMs: Date.now() - startedAt,
      error: error ? 'database_unavailable' : undefined,
    };
  } catch {
    return { ok: false, latencyMs: null, error: 'database_unavailable' };
  }
}

async function checkLiveKit() {
  const host = process.env.NEXT_PUBLIC_LIVEKIT_URL
    ?.replace(/^wss:/, 'https:')
    .replace(/^ws:/, 'http:');

  if (!host || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
    return { ok: false, latencyMs: null, error: 'livekit_not_configured' };
  }

  try {
    const startedAt = Date.now();
    const service = new RoomServiceClient(
      host,
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
    );
    await service.listRooms();
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch {
    return { ok: false, latencyMs: null, error: 'livekit_unavailable' };
  }
}

export async function GET() {
  const startedAt = Date.now();
  const [database, livekit] = await Promise.all([
    checkDatabase(),
    checkLiveKit(),
  ]);

  const checks = {
    app: { ok: true },
    clerk: {
      ok: Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY),
      configured: Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY),
    },
    database,
    livekit,
    discord: {
      ok: true,
      configured: Boolean(process.env.DISCORD_WEBHOOK_URL),
      optional: true,
    },
  };

  const ok = checks.app.ok && checks.clerk.ok && checks.database.ok && checks.livekit.ok;
  const response = {
    status: ok ? 'ok' : 'degraded',
    ok,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    version: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    checks,
  };

  return Response.json(response, {
    status: ok ? 200 : 503,
    headers: noStore(),
  });
}
