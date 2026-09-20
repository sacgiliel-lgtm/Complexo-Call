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

    const token = authHeader.slice(7);
    const admin = getSupabaseAdmin();
    const { data: { user: requester }, error: authError } = await admin.auth.getUser(token);
    if (authError || !requester) return Response.json({ error: 'Sessão inválida ou expirada.' }, { status: 401 });

    const { data: requesterProfile } = await admin
      .from('profiles')
      .select('role,status,username')
      .eq('id', requester.id)
      .single();

    if (!requesterProfile || requesterProfile.role !== 'admin' || requesterProfile.status === 'suspenso') {
      return Response.json({ error: 'Apenas administradores ativos podem criar usuários.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const role = body.role;

    if (!email || !['admin', 'membro'].includes(role)) {
      return Response.json({ error: 'Preencha e-mail e cargo corretamente.' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'Informe um e-mail válido.' }, { status: 400 });
    }
    const redirectTo = `${getSiteUrl(request)}/?activate=1`;
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        role,
      },
      redirectTo,
    });

    if (inviteError) {
      const code = inviteError.code || inviteError.name || '';
      let message = inviteError.message || 'Não foi possível enviar o convite de ativação.';

      if (/not authorized/i.test(message) || code === 'email_address_not_authorized') {
        message = 'O Supabase não está autorizado a enviar para este e-mail. Configure um SMTP personalizado (por exemplo, Brevo) em Authentication → SMTP.';
      } else if (/already registered|already exists|user already/i.test(message)) {
        message = 'Este e-mail já possui uma conta no Supabase. Exclua a conta existente ou use outro e-mail.';
      } else if (/redirect/i.test(message)) {
        message = 'A URL de ativação não está configurada corretamente. Confira NEXT_PUBLIC_SITE_URL e as Redirect URLs do Supabase.';
      } else if (/rate limit|too many/i.test(message)) {
        message = 'O limite de envio de e-mails foi atingido. Aguarde e tente novamente ou configure o SMTP do Brevo.';
      }

      return Response.json({ error: message, code: code || null }, { status: 400 });
    }

    const invitedUser = inviteData?.user;
    if (!invitedUser?.id) {
      return Response.json({ error: 'O Supabase não retornou o usuário convidado.' }, { status: 500 });
    }

    const pendingUsername = `Pendente-${invitedUser.id.slice(0, 8)}`;
    const { error: profileError } = await admin.from('profiles').upsert({
      id: invitedUser.id,
      username: pendingUsername,
      role,
      status: 'ativo',
      presence_status: 'offline',
      must_change_password: true,
    }, { onConflict: 'id' });

    if (profileError) {
      await admin.auth.admin.deleteUser(invitedUser.id);
      throw profileError;
    }

    await logDiscordEvent({
      action: 'user_created',
      actor: { ...requesterProfile, id: requester.id, email: requester.email },
      target: pendingUsername,
      details: `Cargo: ${role}; e-mail: ${email}; convite de ativação enviado`,
    });

    return Response.json({
      success: true,
      emailSent: true,
      user: {
        id: invitedUser.id,
        username: null,
        role,
        email,
      },
      message: `Usuário criado. O convite de ativação foi enviado para ${email}.`,
    });
  } catch (error) {
    console.error('Create user:', error);
    return Response.json({ error: error.message || 'Erro interno.' }, { status: 500 });
  }
}
