import { clerkClient } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { requireAdminFromClerk } from '../../../../lib/clerkAuth';
import { logDiscordEvent } from '../../../../lib/discordLogger';
import crypto from 'crypto';

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
    const userId = String(body.userId || '').trim();
    if (!userId) return Response.json({ error: 'Usuário não informado.' }, { status: 400 });

    const admin = getSupabaseAdmin();
    const { data: targetProfile } = await admin.from('profiles')
      .select('id,username,role,status,pending_email,clerk_user_id')
      .eq('id', userId)
      .maybeSingle();
    if (!targetProfile) return Response.json({ error: 'Usuário não encontrado.' }, { status: 404 });
    if (targetProfile.status === 'suspenso') return Response.json({ error: 'A conta está suspensa.' }, { status: 400 });
    if (!targetProfile.pending_email && !targetProfile.clerk_user_id) return Response.json({ error: 'Este usuário não possui e-mail de ativação pendente.' }, { status: 400 });

    const client = await clerkClient();
    let email = targetProfile.pending_email;
    if (!email && targetProfile.clerk_user_id) {
      const target = await client.users.getUser(targetProfile.clerk_user_id);
      email = target.emailAddresses?.[0]?.emailAddress || '';
    }
    if (!email) return Response.json({ error: 'Este usuário não possui e-mail.' }, { status: 400 });

    const siteUrl = getSiteUrl(request);
    const invitationExpiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
    const activationToken = createActivationToken(targetProfile.id, invitationExpiresAt);
    const invitation = await client.invitations.createInvitation({
      emailAddress: email,
      expiresInDays: 7,
      ignoreExisting: true,
      redirectUrl: `${siteUrl}/?activate=1&activation_token=${encodeURIComponent(activationToken)}`,
      publicMetadata: { role: targetProfile.role },
    });

    await logDiscordEvent({
      action: 'user_invite_resent',
      actor: { ...requester.profile, id: requester.id, email: requester.email },
      target: targetProfile.username || email,
      details: `Reenvio do convite Clerk para ${email}`,
      request,
    });

    return Response.json({ success: true, emailSent: true, invitationId: invitation.id, message: `E-mail de ativação reenviado para ${email}.` });
  } catch (error) {
    console.error('Resend user invite:', error);
    return Response.json({ error: error.message || 'Não foi possível reenviar a ativação.' }, { status: 500 });
  }
}
