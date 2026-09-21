import crypto from 'crypto';
import { clerkClient } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { getEmailLoginExternalId } from '../../../lib/clerkAuth';

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

    const emailHash = crypto.createHash('sha256').update(email).digest('hex').slice(0, 12);
    const emailExternalId = getEmailLoginExternalId(email);
    console.info('Resolve login input fingerprint:', { emailHash, hasExternalId: !!emailExternalId });
    if (emailExternalId) {
      const externalResult = await client.users.getUserList({
        externalId: [emailExternalId],
        limit: 10,
      });
      const externalUsers = externalResult?.data || [];
      console.info('Resolve login Clerk external-id lookup:', {
        found: externalUsers.length,
        hasUsername: !!externalUsers[0]?.username,
      });
      if (externalUsers[0]?.username) {
        return json({ username: externalUsers[0].username });
      }
    }

    // Primeiro usamos o filtro específico de e-mail. Se a instância não
    // devolver o usuário por esse índice, repetimos com query, que pesquisa
    // os atributos indexados do usuário, incluindo e-mail.
    const exactResult = await client.users.getUserList({
      emailAddress: [email],
      limit: 10,
    });

    // O filtro emailAddress do próprio Clerk já garante que o resultado
    // pertence a esse endereço. Não exigimos uma segunda comparação do
    // objeto retornado, pois isso pode variar conforme a representação do SDK.
    const exactUsers = exactResult?.data || [];
    console.info('Resolve login Clerk exact lookup:', {
      found: exactUsers.length,
      hasUsername: !!exactUsers[0]?.username,
    });
    if (exactUsers[0]?.username) {
      return json({ username: exactUsers[0].username });
    }

    const queryResult = await client.users.getUserList({
      query: email,
      limit: 50,
    });
    const candidates = queryResult?.data || [];
    console.info('Resolve login Clerk query lookup:', {
      found: candidates.length,
    });

    const clerkUser = candidates.find((user) =>
      user.emailAddresses?.some(
        (item) => String(item.emailAddress || '').trim().toLowerCase() === email
      )
    );

    if (clerkUser?.username) {
      return json({ username: clerkUser.username });
    }

    // Fallback pelo cadastro interno. Usamos lista em vez de maybeSingle
    // porque convites antigos/reconvites podem ter deixado mais de um registro.
    const { data: profiles, error: profileError } = await admin
      .from('profiles')
      .select('clerk_user_id,pending_email,username,status')
      .ilike('pending_email', email)
      .limit(50);

    if (profileError) {
      console.error('Resolve login profile lookup:', profileError);
      return json({ error: 'Não foi possível localizar sua conta.' }, { status: 500 });
    }

    console.info('Resolve login profile lookup:', {
      found: (profiles || []).length,
      withClerkId: (profiles || []).filter((profile) => profile?.clerk_user_id).length,
      withUsername: (profiles || []).filter((profile) => profile?.username).length,
    });

    const linkedProfiles = (profiles || [])
      .filter((profile) => profile?.clerk_user_id)
      .sort((a, b) => {
        if (a.status === 'ativo' && b.status !== 'ativo') return -1;
        if (a.status !== 'ativo' && b.status === 'ativo') return 1;
        return 0;
      });

    for (const profile of linkedProfiles) {
      try {
        const linkedClerkUser = await client.users.getUser(profile.clerk_user_id);
        if (linkedClerkUser?.username) {
          return json({ username: linkedClerkUser.username });
        }
      } catch (error) {
        console.warn('Resolve login: vínculo Clerk inválido.', {
          clerkUserId: profile.clerk_user_id,
          error: error?.message || String(error),
        });
      }
    }

    // Compatibilidade com contas antigas: o perfil pode conter o e-mail
    // administrativo em pending_email mesmo quando clerk_user_id ainda não foi
    // preenchido. O password continuará sendo validado pelo próprio Clerk.
    const legacyProfile = (profiles || [])
      .filter((profile) => profile?.pending_email && profile?.username)
      .find((profile) => {
        const username = String(profile.username).trim();
        return username && !username.startsWith('Pendente-');
      });

    if (legacyProfile?.username) {
      console.info('Resolve login legacy profile fallback: username recovered.');
      return json({ username: legacyProfile.username });
    }

    return json({ error: 'Conta não encontrada.' }, { status: 404 });
  } catch (error) {
    console.error('Resolve login:', error);
    return json({ error: 'Não foi possível localizar a conta.' }, { status: 500 });
  }
}
