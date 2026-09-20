import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { logDiscordEvent } from '../../../../lib/discordLogger';

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
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return Response.json({ error: 'Token não fornecido.' }, { status: 401 });

    const admin = getSupabaseAdmin();
    const token = authHeader.slice(7);
    const { data: { user: requester }, error: authError } = await admin.auth.getUser(token);
    if (authError || !requester) return Response.json({ error: 'Sessão inválida ou expirada.' }, { status: 401 });

    const { data: requesterProfile } = await admin.from('profiles').select('role,status,username').eq('id', requester.id).single();
    if (!requesterProfile || requesterProfile.role !== 'admin' || requesterProfile.status === 'suspenso') {
      return Response.json({ error: 'Apenas administradores ativos podem reenviar convites.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const userId = String(body.userId || '').trim();
    if (!userId) return Response.json({ error: 'Usuário não informado.' }, { status: 400 });

    const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(userId);
    if (targetError || !targetData?.user) return Response.json({ error: 'Usuário não encontrado.' }, { status: 404 });

    const target = targetData.user;
    if (target.email_confirmed_at) {
      return Response.json({ error: 'Este usuário já confirmou o e-mail.' }, { status: 400 });
    }
    if (!target.email) return Response.json({ error: 'Este usuário não possui e-mail.' }, { status: 400 });

    const { data: profile } = await admin.from('profiles').select('username,role,status').eq('id', userId).single();
    if (!profile || profile.status === 'suspenso') {
      return Response.json({ error: 'A conta não está disponível para ativação.' }, { status: 400 });
    }

    const redirectTo = `${getSiteUrl(request)}/?activate=1`;
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(target.email, {
      data: {
        username: profile.username,
        role: profile.role,
      },
      redirectTo,
    });

    if (inviteError) return Response.json({ error: inviteError.message }, { status: 400 });

    await logDiscordEvent({
      action: 'user_invite_resent',
      actor: { ...requesterProfile, id: requester.id, email: requester.email },
      target: profile.username || target.email,
      details: `Reenvio do convite de ativação para ${target.email}`,
    });

    return Response.json({
      success: true,
      emailSent: true,
      message: `E-mail de ativação reenviado para ${target.email}.`,
    });
  } catch (error) {
    console.error('Resend user invite:', error);
    return Response.json({ error: error.message || 'Erro interno.' }, { status: 500 });
  }
}
