import crypto from 'crypto';
import { clerkClient } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { requireAdminFromClerk } from '../../../../lib/clerkAuth';
import { logDiscordEvent } from '../../../../lib/discordLogger';


function getActivationSigningSecret() {
  const secret = process.env.CLERK_SECRET_KEY?.trim();
  if (!secret) throw new Error('CLERK_SECRET_KEY não está configurada.');
  return secret;
}

function createActivationToken(profileId, expiresAt) {
  const payload = `${profileId}.${expiresAt}`;
  const signature = crypto
    .createHmac('sha256', getActivationSigningSecret())
    .update(payload)
    .digest('base64url');
  return `${profileId}.${expiresAt}.${signature}`;
}

function getSiteUrl(request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`.replace(/\/$/, '');
  return 'http://localhost:3000';
}

export async function POST(request) {
  try {
    const requester = await requireAdminFromClerk();
    if (!requester.ok) return Response.json({ error: requester.error }, { status: requester.status || 401 });

    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const role = body.role;

    if (!email || !['admin', 'membro'].includes(role)) return Response.json({ error: 'Preencha e-mail e cargo corretamente.' }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: 'Informe um e-mail válido.' }, { status: 400 });

    const client = await clerkClient();
    const siteUrl = getSiteUrl(request);
    const admin = getSupabaseAdmin();
    const pendingId = crypto.randomUUID();
    const pendingUsername = `Pendente-${pendingId.slice(0, 8)}`;

    // Criamos primeiro o perfil pendente e colocamos sua referência nos
    // publicMetadata do convite. O Clerk copia esse metadata para o usuário
    // após a aceitação, permitindo que a ativação seja vinculada sem depender
    // de parâmetros que podem desaparecer da URL.
    const { error: profileError } = await admin.from('profiles').insert({
      id: pendingId,
      username: pendingUsername,
      role,
      status: 'ativo',
      presence_status: 'offline',
      pending_email: email,
      clerk_user_id: null,
    });
    if (profileError) throw profileError;

    const invitationExpiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
    const activationToken = createActivationToken(pendingId, invitationExpiresAt);

    let invitation;
    try {
      invitation = await client.invitations.createInvitation({
        emailAddress: email,
        expiresInDays: 7,
        redirectUrl: `${siteUrl}/?activate=1&activation_token=${encodeURIComponent(activationToken)}`,
        publicMetadata: {
          role,
          pendingProfileId: pendingId,
          pendingEmail: email,
        },
      });
    } catch (error) {
      try { await admin.from('profiles').delete().eq('id', pendingId); } catch {}
      throw error;
    }

    await logDiscordEvent({
      action: 'user_created',
      actor: { ...requester.profile, id: requester.id, email: requester.email },
      target: pendingUsername,
      details: `Cargo: ${role}; e-mail: ${email}; convite Clerk enviado`,
    });

    return Response.json({
      success: true,
      emailSent: true,
      user: { id: pendingId, username: null, role, email, invitationId: invitation.id },
      message: `Usuário criado. O convite de ativação foi enviado para ${email}.`,
    });
  } catch (error) {
    console.error('Create user:', error);
    return Response.json({ error: error.message || 'Não foi possível criar o usuário.' }, { status: 500 });
  }
}
