import crypto from 'crypto';
import { clerkClient } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      ...(init.headers || {}),
    },
  });
}

async function rateLimit(admin, key, max = 10, seconds = 60) {
  const hashed = crypto.createHash('sha256').update(key).digest('hex');
  const { data, error } = await admin.rpc('consume_rate_limit', {
    p_key: hashed,
    p_max: max,
    p_window_seconds: seconds,
  });
  if (error) {
    console.error('Resolve login rate limit RPC:', error);
    return false;
  }
  return !!data?.[0]?.allowed;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@') || email.length > 254) {
      return json({ error: 'Identificador inválido.' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';

    if (!(await rateLimit(admin, `resolve-login:${ip}`))) {
      return json({ error: 'Muitas tentativas. Aguarde um instante.' }, { status: 429 });
    }

    const client = await clerkClient();
    const result = await client.users.getUserList({
      emailAddress: [email],
      limit: 10,
    });
    const clerkUser = (result?.data || []).find((user) =>
      user.emailAddresses?.some(
        (item) => String(item.emailAddress || '').trim().toLowerCase() === email
      )
    );

    if (clerkUser?.username) {
      return json({ username: clerkUser.username });
    }

    // Compatibilidade com perfis antigos: se o e-mail ainda estiver salvo
    // no cadastro do Complexo Call, usamos o clerk_user_id para localizar
    // a conta e seu username.
    const { data: profile } = await admin
      .from('profiles')
      .select('clerk_user_id,pending_email')
      .ilike('pending_email', email)
      .maybeSingle();

    if (profile?.clerk_user_id) {
      const legacyClerkUser = await client.users.getUser(profile.clerk_user_id);
      if (legacyClerkUser?.username) {
        return json({ username: legacyClerkUser.username });
      }
    }

    return json({ error: 'Conta não encontrada.' }, { status: 404 });
  } catch (error) {
    console.error('Resolve login:', error);
    return json({ error: 'Não foi possível localizar a conta.' }, { status: 500 });
  }
}
