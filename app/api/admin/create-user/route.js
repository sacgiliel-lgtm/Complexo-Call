import crypto from 'crypto';
import { clerkClient } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { requireAdminFromClerk } from '../../../../lib/clerkAuth';
import { logDiscordEvent } from '../../../../lib/discordLogger';
import { sendInvitationEmail } from '../../../../lib/invitationEmail';

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
    const expiresInDays = 7;
    const siteUrl = getSiteUrl(request);
    const invitation = await client.invitations.createInvitation({
      emailAddress: email,
      expiresInDays,
      notify: false,
      redirectUrl: `${siteUrl}/?activate=1`,
      publicMetadata: { role },
    });

    const admin = getSupabaseAdmin();
    const pendingId = crypto.randomUUID();
    const pendingUsername = `Pendente-${pendingId.slice(0, 8)}`;
    const { error: profileError } = await admin.from('profiles').insert({
      id: pendingId,
      username: pendingUsername,
      role,
      status: 'ativo',
      presence_status: 'offline',
      must_change_password: false,
      pending_email: email,
      clerk_user_id: null,
    });
    if (profileError) {
      try { await client.invitations.revokeInvitation(invitation.id); } catch {}
      throw profileError;
    }

    try {
      await sendInvitationEmail({
        to: email,
        invitationUrl: invitation.url,
        inviterName: requester.profile?.username || requester.email || 'Administrador',
        expiresInDays,
        siteUrl,
      });
    } catch (emailError) {
      try { await client.invitations.revokeInvitation(invitation.id); } catch {}
      await admin.from('profiles').delete().eq('id', pendingId);
      throw emailError;
    }

    await logDiscordEvent({
      action: 'user_created',
      actor: { ...requester.profile, id: requester.id, email: requester.email },
      target: pendingUsername,
      details: `Cargo: ${role}; e-mail: ${email}; convite Clerk criado e e-mail CPX enviado`,
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
